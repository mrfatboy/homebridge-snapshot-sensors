import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { FRAME_WIDTH, FRAME_HEIGHT, THRESHOLD_KEEP } from './settings.js';
import { normalizeFrame } from './ir.js';
import type * as OrtType from 'onnxruntime-node';
import type { Detection } from './types.js';
import { getYolo26ClassName } from '../model/yolo26/classes.js';

function findPackageRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error(`Cannot locate package root from ${from}`);
}

const MODEL_PATH = join(findPackageRoot(dirname(fileURLToPath(import.meta.url))), 'model', 'yolo26', 'model.onnx');

let ort: typeof OrtType | null = null;
let session: OrtType.InferenceSession | null = null;
let loading: Promise<void> | null = null;

const SUPPORTED_ARCHS: Record<string, readonly string[]> = {
  darwin: ['x64', 'arm64'],
  linux: ['x64', 'arm64'],
  win32: ['x64', 'arm64'],
};

function unsupportedPlatformMessage(): string {
  return `onnxruntime-node has no prebuilt binary for ${process.platform}/${process.arch}. Supported: macOS (x64/arm64), Linux (x64/arm64), Windows (x64/arm64). On a Raspberry Pi, install the 64-bit (arm64) Raspberry Pi OS.`;
}

async function getOrt(): Promise<typeof OrtType> {
  if (ort) return ort;
  if (!SUPPORTED_ARCHS[process.platform]?.includes(process.arch)) throw new Error(unsupportedPlatformMessage());
  try {
    ort = await import('onnxruntime-node');
    ort.env.logLevel = 'error';
  } catch (e) {
    throw new Error(`${unsupportedPlatformMessage()} (failed to load native binding: ${String(e)})`);
  }
  return ort;
}

export async function loadModel(): Promise<void> {
  if (session) return;
  if (!loading) {
    loading = (async () => {
      const o = await getOrt();
      session = await o.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3,
        extra: { session: { intra_op_num_threads: '2', inter_op_num_threads: '1' } },
      });
    })().finally(() => { loading = null; });
  }
  return loading;
}

export async function closeModel(): Promise<void> {
  if (!session) return;
  await session.release();
  session = null;
}

export async function runInference(frameRGB: Buffer): Promise<Detection[]> {
  if (!session || !ort) throw new Error('Model not loaded');
  normalizeFrame(frameRGB);
  const wh = FRAME_WIDTH * FRAME_HEIGHT;
  const data = new Float32Array(3 * wh);
  for (let i = 0, j = 0; i < wh; i++, j += 3) {
    data[i] = frameRGB[j] / 255;
    data[i + wh] = frameRGB[j + 1] / 255;
    data[i + 2 * wh] = frameRGB[j + 2] / 255;
  }
  const tensor = new ort.Tensor('float32', data, [1, 3, FRAME_HEIGHT, FRAME_WIDTH]);
  const inName = session.inputNames[0] ?? 'images';
  const outputs = await session.run({ [inName]: tensor });
  return postprocess(outputs);
}

function postprocess(outputs: Record<string, OrtType.Tensor>): Detection[] {
  const out = outputs[Object.keys(outputs)[0]];
  if (out.dims.length < 3 || out.dims[2] !== 6) return [];
  const data = out.data as Float32Array;
  const numBoxes = out.dims[1];
  const result: Detection[] = [];
  for (let i = 0; i < numBoxes; i++) {
    const base = i * 6;
    const score = data[base + 4];
    if (score < THRESHOLD_KEEP) continue;
    const classId = Math.round(data[base + 5]);
    result.push({
      x1: Math.max(0, Math.min(FRAME_WIDTH, data[base])),
      y1: Math.max(0, Math.min(FRAME_HEIGHT, data[base + 1])),
      x2: Math.max(0, Math.min(FRAME_WIDTH, data[base + 2])),
      y2: Math.max(0, Math.min(FRAME_HEIGHT, data[base + 3])),
      score,
      classId,
      className: getYolo26ClassName(classId),
    });
  }
  return result;
}
