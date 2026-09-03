import type { NotificationProviderSender } from '../types.js';

export const sendPushSafer: NotificationProviderSender = async ({ channel, title, message, sound }) => {
  const privateKey = channel.privateKey?.trim();
  if (!privateKey) throw new Error('Push Safer Private Key is required.');

  const form = new URLSearchParams({
    k: privateKey,
    t: title,
    m: message,
    d: channel.pushsaferDevice?.trim() || '',
    i: String(channel.icon ?? 1),
    v: String(channel.vibration ?? 1),
    p: String(channel.priority ?? 0),
  });
  if (sound?.trim()) form.set('s', sound.trim());
  if (channel.iconColor?.trim()) form.set('c', channel.iconColor.trim());
  if (channel.url?.trim()) form.set('u', channel.url.trim());
  if (channel.urlTitle?.trim()) form.set('ut', channel.urlTitle.trim());
  if (channel.timeToLive !== undefined) form.set('l', String(channel.timeToLive));
  if (channel.retry !== undefined) form.set('re', String(channel.retry));
  if (channel.expire !== undefined) form.set('ex', String(channel.expire));

  const response = await fetch('https://www.pushsafer.com/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Push Safer returned HTTP ${response.status}`);
};
