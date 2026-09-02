import type { NotificationChannel } from './types.js';

export async function sendPushcutNotification(channel: NotificationChannel, message: string): Promise<void> {
  const url = channel.pushcutUrl?.trim();
  if (!url) throw new Error('Pushcut Webhook URL is required.');
  let endpoint: URL;
  try { endpoint = new URL(url); } catch { throw new Error('Pushcut Webhook URL is not valid.'); }
  if (endpoint.protocol !== 'https:') throw new Error('Pushcut Webhook URL must use HTTPS.');
  const title = channel.title?.trim() || 'Snapshot Sensors';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text: message }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Pushcut returned HTTP ${response.status}`);
}
