import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { Logger } from 'homebridge';

const SNAPSHOT_TIMEOUT_MS = 15_000;

export async function fetchSnapshot(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Snapshot request timed out after ${SNAPSHOT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

export async function saveSnapshot(
  image: Buffer,
  directory: string,
  prefix: string,
  suffix: string,
  log: Logger,
): Promise<string> {
  if (!directory.trim()) throw new Error('Snapshot Directory is required when storing snapshots');
  const safePrefix = prefix.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'SnapshotSensor';
  const filename = `${safePrefix}_${timestamp()}${suffix}`;
  const path = join(directory, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, image);
  log.info(`Saved snapshot: ${path}`);
  return path;
}
