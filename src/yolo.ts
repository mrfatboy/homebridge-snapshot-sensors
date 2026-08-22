import { runInference } from './inference.js';
import type { Detection, StoreSnapshots } from './types.js';

export interface YoloResult {
  detections: Detection[];
  annotatedImage?: Buffer;
}

export async function runYolo(image: Buffer, _storeSnapshots: StoreSnapshots): Promise<YoloResult> {
  const detections: Detection[] = await runInference(image);
  return { detections };
}
