import type { NotificationProviderSender } from '../types.js';

export const sendPushcut: NotificationProviderSender = async ({ channel, title, message }) => {
  const value = channel.pushcutUrl?.trim();
  if (!value) throw new Error('Pushcut Webhook URL is required.');

  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('Pushcut Webhook URL is not valid.');
  }
  if (endpoint.protocol !== 'https:') throw new Error('Pushcut Webhook URL must use HTTPS.');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text: message }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Pushcut returned HTTP ${response.status}`);
  return response.status;
};
