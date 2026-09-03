const MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024;

export interface SnapshotResponse {
  image: Buffer;
  contentType: string;
}

export async function fetchSnapshot(url: string): Promise<SnapshotResponse> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Camera returned HTTP ${response.status}`);

  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const size = Number(contentLength);
    if (!Number.isFinite(size) || size < 0) throw new Error('Camera returned an invalid Content-Length header');
    if (size > MAX_SNAPSHOT_SIZE) throw new Error('Camera snapshot exceeds the maximum allowed size of 10 MB');
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const image = Buffer.from(await response.arrayBuffer());
  if (!image.length) throw new Error('Camera returned an empty response');
  if (image.length > MAX_SNAPSHOT_SIZE) throw new Error('Snapshot image exceeds the maximum allowed size of 10 MB');

  return { image, contentType };
}
