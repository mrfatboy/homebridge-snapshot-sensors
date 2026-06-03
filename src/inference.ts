import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { FRAME_WIDTH, FRAME_HEIGHT, THRESHOLD_KEEP } from './settings.js';
import { normalizeFrame } from './ir.js';
import type * as OrtType from 'onnxruntime-node';
import type { Detection } from './types.js';

const MODEL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'model',
  'yolo26n.onnx',
);

// Initialize ONNX Runtime lazily and set its global log level before the
// first session is created so startup-only GPU probing warnings stay hidden.
let ort: typeof OrtType | null = null;
let session: OrtType.InferenceSession | null = null;
let loading: Promise<void> | null = null;

// Platforms onnxruntime-node ships a prebuilt native binary for. There is no
// build for 32-bit ARM (armv7/armhf) — notably the legacy 32-bit Raspberry Pi
// OS — so the native load there fails with an opaque error. We check up front
// and, as a backstop, translate any load failure into actionable guidance.
const SUPPORTED_ARCHS: Record<string, readonly string[]> = {
  darwin: ['x64', 'arm64'],
  linux: ['x64', 'arm64'],
  win32: ['x64', 'arm64'],
};

function unsupportedPlatformMessage(): string {
  return (
    `onnxruntime-node has no prebuilt binary for ${process.platform}/${process.arch}. ` +
    'Supported: macOS (x64/arm64), Linux (x64/arm64), Windows (x64/arm64). ' +
    'On a Raspberry Pi, install the 64-bit (arm64) Raspberry Pi OS — the 32-bit (armv7) build is not supported.'
  );
}

async function getOrt(): Promise<typeof OrtType> {
  if (ort) return ort;
  if (!SUPPORTED_ARCHS[process.platform]?.includes(process.arch)) {
    throw new Error(unsupportedPlatformMessage());
  }
  try {
    ort = await import('onnxruntime-node');
    ort.env.logLevel = 'error';
  } catch (e) {
    // Nominally supported, but the native binding still failed to load (missing
    // or corrupt download, glibc mismatch, etc.) — surface the original error
    // alongside the platform context so the cause isn't buried.
    throw new Error(`${unsupportedPlatformMessage()} (failed to load native binding: ${String(e)})`);
  }
  return ort;
}

export async function loadModel(): Promise<void> {
  if (session) return;
  // Coalesce concurrent first-calls so we only ever create one session.
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
    data[i]          = frameRGB[j]     / 255;
    data[i + wh]     = frameRGB[j + 1] / 255;
    data[i + 2 * wh] = frameRGB[j + 2] / 255;
  }
  const tensor = new ort.Tensor('float32', data, [1, 3, FRAME_HEIGHT, FRAME_WIDTH]);

  const inName = session.inputNames[0] ?? 'images';
  const outputs = await session.run({ [inName]: tensor });
  return postprocess(outputs);
}

// YOLO26 output: [1, N, 6] rows of [x1, y1, x2, y2, score, classId], sorted by score, NMS-free.
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
    result.push({
      x1: Math.max(0, Math.min(FRAME_WIDTH,  data[base + 0])),
      y1: Math.max(0, Math.min(FRAME_HEIGHT, data[base + 1])),
      x2: Math.max(0, Math.min(FRAME_WIDTH,  data[base + 2])),
      y2: Math.max(0, Math.min(FRAME_HEIGHT, data[base + 3])),
      score,
      classId: Math.round(data[base + 5]),
    });
  }
  return result;
}
