export type WebhookMethod = 'GET' | 'POST';

export interface WebhookPayload {
  camera: string;
  object: string;
  confidence: number | null;
}

export async function sendWebhook(url: string | URL, method: WebhookMethod, payload: WebhookPayload): Promise<Response> {
  const endpoint = new URL(url.toString());
  const options: RequestInit = { method, signal: AbortSignal.timeout(15000) };

  if (method === 'POST') {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(payload);
  } else {
    endpoint.searchParams.set('camera', payload.camera);
    endpoint.searchParams.set('object', payload.object);
    endpoint.searchParams.set('confidence', payload.confidence === null ? 'null' : String(payload.confidence));
  }

  return fetch(endpoint, options);
}
