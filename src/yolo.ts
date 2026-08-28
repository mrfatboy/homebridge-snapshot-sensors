import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getYolo26ClassName } from '../model/yolo26/classes.js';
import { categoryOfClass } from './categories.js';
import type { Detection, SensorSpec, StoreSnapshots } from './types.js';

export interface YoloResult {
  detections: Detection[];
  annotatedImage?: Buffer;
}

const MODEL_WIDTH = 1024;
const MODEL_HEIGHT = 576;

function packageRoot(): string {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

const modelPath = join(packageRoot(), 'model', 'yolo26', 'model.onnx');

const sessionPromise = ort.InferenceSession.create(modelPath).then(session => {
  console.log(`[${new Date().toLocaleString('en-US')}] [SnapshotSensors] Plugin loaded successfully — YOLO26 model loaded and ready for detection.`);
  return session;
});

let inferenceRunning = false;

export async function runYolo(
  image: Buffer,
  storeSnapshots: StoreSnapshots,
  sensors?: SensorSpec[],
): Promise<YoloResult | null> {
  if (inferenceRunning) return null;
  inferenceRunning = true;

  try {
    const source = sharp(image).rotate();
    const metadata = await source.metadata();
    const sourceWidth = metadata.width;
    const sourceHeight = metadata.height;

    if (!sourceWidth || !sourceHeight) {
      throw new Error('Unable to determine snapshot image dimensions');
    }

    const { data } = await source
      .clone()
      .resize(MODEL_WIDTH, MODEL_HEIGHT, { fit: 'fill' })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = MODEL_WIDTH * MODEL_HEIGHT;
    const tensorData = new Float32Array(3 * pixels);

    for (let i = 0; i < pixels; i++) {
      const pixelOffset = i * 3;
      tensorData[i] = data[pixelOffset] / 255;
      tensorData[pixels + i] = data[pixelOffset + 1] / 255;
      tensorData[(2 * pixels) + i] = data[pixelOffset + 2] / 255;
    }

    const session = await sessionPromise;
    const tensor = new ort.Tensor('float32', tensorData, [1, 3, MODEL_HEIGHT, MODEL_WIDTH]);
    const results = await session.run({ images: tensor });
    const output = results.output0;

    if (!output) {
      throw new Error('YOLO26 model did not return output0');
    }

    const detections: Detection[] = [];

    for (let i = 0; i < output.dims[1]; i++) {
      const offset = i * 6;
      const x1 = Number(output.data[offset]);
      const y1 = Number(output.data[offset + 1]);
      const x2 = Number(output.data[offset + 2]);
      const y2 = Number(output.data[offset + 3]);
      const score = Number(output.data[offset + 4]);
      const classId = Math.round(Number(output.data[offset + 5]));

      if (!Number.isFinite(score) || score <= 0) continue;

      try {
        detections.push({
          x1,
          y1,
          x2,
          y2,
          score,
          classId,
          className: getYolo26ClassName(classId),
        });
      } catch {
        // Ignore invalid class IDs returned by the model.
      }
    }

    // Annotation uses the same user-defined category confidence thresholds
    // as sensor triggering. There is no separate global annotation threshold.
    const annotationDetections = sensors === undefined
      ? []
      : detections.filter(detection => {
        const category = categoryOfClass(detection.classId);
        if (category === null) return false;
        return sensors.some(sensor => {
          const threshold = sensor.thresholds[category];
          return sensor.categories.includes(category) &&
            threshold !== undefined &&
            detection.score >= threshold;
        });
      });

    let annotatedImage: Buffer | undefined;

    if (storeSnapshots === 'annotated' && annotationDetections.length > 0) {
      const scaleX = sourceWidth / MODEL_WIDTH;
      const scaleY = sourceHeight / MODEL_HEIGHT;
      const boxes = annotationDetections.map(detection => {
        const x = Math.max(0, Math.min(sourceWidth, detection.x1 * scaleX));
        const y = Math.max(0, Math.min(sourceHeight, detection.y1 * scaleY));
        const x2 = Math.max(0, Math.min(sourceWidth, detection.x2 * scaleX));
        const y2 = Math.max(0, Math.min(sourceHeight, detection.y2 * scaleY));
        const width = Math.max(0, x2 - x);
        const height = Math.max(0, y2 - y);
        const fontSize = Math.max(18, Math.round(Math.min(sourceWidth, sourceHeight) / 30));
        const label = `${detection.className} ${detection.score.toFixed(2).replace(/^0/, '')}`;

        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="red" stroke-width="4"/><text x="${x + 6}" y="${Math.max(fontSize, y + fontSize)}" font-family="Arial" font-size="${fontSize}" fill="white">${label}</text>`;
      }).join('');

      const overlay = Buffer.from(`<svg width="${sourceWidth}" height="${sourceHeight}" xmlns="http://www.w3.org/2000/svg">${boxes}</svg>`);

      annotatedImage = await source
        .clone()
        .composite([{ input: overlay }])
        .jpeg()
        .toBuffer();
    }

    return { detections, annotatedImage };
  } finally {
    inferenceRunning = false;
  }
}
