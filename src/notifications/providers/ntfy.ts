import type { NotificationProviderSender } from '../types.js';

export const sendNtfy: NotificationProviderSender = async ({ channel, title, message }) => {
  const server = (channel.server?.trim() || 'https://ntfy.sh').replace(/\/+$/, '');
  const topic = channel.topic?.trim();
  if (!topic) throw new Error('ntfy Topic is required.');

  let endpoint: URL;
  try {
    endpoint = new URL(`${server}/${encodeURIComponent(topic)}`);
  } catch {
    throw new Error('ntfy Server URL is not valid.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('ntfy Server URL must use HTTP or HTTPS.');

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: title,
    Priority: String(channel.priority ?? 3),
  };
  if (channel.tags?.trim()) headers.Tags = channel.tags.trim();
  if (channel.accessToken?.trim()) headers.Authorization = `Bearer ${channel.accessToken.trim()}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: message,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`);
};
