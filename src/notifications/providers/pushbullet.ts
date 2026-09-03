import type { NotificationProviderSender } from '../types.js';

export const sendPushbullet: NotificationProviderSender = async ({ channel, title, message }) => {
  const apiKey = channel.apiKey?.trim();
  if (!apiKey) throw new Error('Pushbullet Access Token is required.');

  const deviceIden = channel.deviceIden?.trim();
  const email = channel.email?.trim();
  const channelTag = channel.channelTag?.trim();
  const targets = [deviceIden, email, channelTag].filter(Boolean);
  if (targets.length > 1) {
    throw new Error('Specify only one Pushbullet target: Device Identifier, Email, or Channel Tag.');
  }

  const push: Record<string, string> = { type: 'note', title, body: message };
  if (deviceIden) push.device_iden = deviceIden;
  else if (email) push.email = email;
  else if (channelTag) push.channel_tag = channelTag;

  const response = await fetch('https://api.pushbullet.com/v2/pushes', {
    method: 'POST',
    headers: { 'Access-Token': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(push),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Pushbullet returned HTTP ${response.status}`);
  return response.status;
};
