import type { NotificationProviderSender } from '../types.js';

export const sendPushover: NotificationProviderSender = async ({ channel, title, message, sound }) => {
  const token = channel.token?.trim();
  const user = channel.user?.trim();
  if (!token || !user) throw new Error('Pushover token and user are required.');

  const form = new URLSearchParams({
    token,
    user,
    message,
    title,
    sound: sound?.trim() || 'pushover',
  });
  if (channel.device?.trim()) form.set('device', channel.device.trim());

  const response = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.status !== 1) {
    const detail = Array.isArray(body?.errors) ? body.errors.join(', ') : `HTTP ${response.status}`;
    throw new Error(`Pushover returned ${detail}`);
  }
};
