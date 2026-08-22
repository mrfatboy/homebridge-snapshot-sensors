import type { Logger } from 'homebridge';
import type { Detection, StoreSnapshots } from './types.js';

const YOLO_URL = (process.env.YOLO_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const YOLO_TIMEOUT_MS = 30_000;

export interface YoloResult { detections: Detection[]; annotatedImage?: Buffer; contentType?: string; }

function normalizeDetection(value: unknown): Detection | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const score = Number(item.score ?? item.confidence ?? item.conf ?? 0);
  const classId = Number(item.classId ?? item.class_id ?? item.id ?? -1);
  const className = String(item.className ?? item.class_name ?? item.class ?? item.label ?? '');
  if (!Number.isFinite(score) || !className) return null;
  return { x1: Number(item.x1 ?? item.left ?? 0), y1: Number(item.y1 ?? item.top ?? 0), x2: Number(item.x2 ?? item.right ?? 0), y2: Number(item.y2 ?? item.bottom ?? 0), score, classId: Number.isFinite(classId) ? classId : -1, className };
}

function extractDetections(body: Record<string, unknown>): Detection[] {
  const candidates = body.detections ?? body.results ?? body.objects ?? body.predictions;
  if (!Array.isArray(candidates)) return [];
  return candidates.map(normalizeDetection).filter((d): d is Detection => d !== null);
}

function decodeImage(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const base64 = value.includes(',') && value.startsWith('data:') ? value.split(',', 2)[1] : value;
  try { return Buffer.from(base64, 'base64'); } catch { return undefined; }
}

export async function runYolo(image: Buffer, storeSnapshots: StoreSnapshots, log: Logger): Promise<YoloResult> {
  const form = new FormData();
  form.append('file', new Blob([image], { type: 'image/jpeg' }), 'snapshot.jpg');
  form.append('store_snapshots', storeSnapshots);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YOLO_TIMEOUT_MS);
  try {
    const response = await fetch(`${YOLO_URL}/detect`, { method: 'POST', body: form, signal: controller.signal });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`YOLO request failed (${response.status}): ${detail}`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.startsWith('image/')) return { detections: [], annotatedImage: Buffer.from(await response.arrayBuffer()), contentType };
    const body = (await response.json()) as Record<string, unknown>;
    const annotatedImage = decodeImage(body.annotated_image ?? body.annotatedImage ?? body.image ?? body.image_base64);
    log.debug(`YOLO analyzed snapshot using store_snapshots=${storeSnapshots}`);
    return { detections: extractDetections(body), annotatedImage, contentType };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error(`YOLO request timed out after ${YOLO_TIMEOUT_MS}ms`);
    throw error;
  } finally { clearTimeout(timeout); }
}
