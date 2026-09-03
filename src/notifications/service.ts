import type { Category, NotificationChannel, NotificationConfig } from '../types.js';
import type { NotificationProvider, NotificationRequest, NotificationResult, NotificationProviderSender } from './types.js';
import { sendNtfy } from './providers/ntfy.js';
import { sendPushSafer } from './providers/pushsafer.js';
import { sendPushbullet } from './providers/pushbullet.js';
import { sendPushcut } from './providers/pushcut.js';
import { sendPushover } from './providers/pushover.js';

const PROVIDERS: Record<NotificationProvider, { name: string; send: NotificationProviderSender }> = {
  pushover: { name: 'Pushover', send: sendPushover },
  pushbullet: { name: 'Pushbullet', send: sendPushbullet },
  ntfy: { name: 'ntfy', send: sendNtfy },
  pushsafer: { name: 'Push Safer', send: sendPushSafer },
  pushcut: { name: 'Pushcut', send: sendPushcut },
};

type NotificationCategory = Category | 'unidentified';

const MESSAGE_KEYS: Record<NotificationCategory, keyof NotificationChannel> = {
  unidentified: 'unidentifiedMessage',
  people: 'personMessage',
  animals: 'animalMessage',
  vehicles: 'vehicleMessage',
};

const SOUND_KEYS: Record<NotificationCategory, keyof NotificationChannel> = {
  unidentified: 'unidentifiedSound',
  people: 'personSound',
  animals: 'animalSound',
  vehicles: 'vehicleSound',
};

function channelFor(notification: NotificationConfig, provider: NotificationProvider): NotificationChannel | undefined {
  return notification[provider];
}

export function notificationProvider(notification?: NotificationConfig, category?: NotificationCategory): string | null {
  const provider = notification?.provider;
  if (!provider || provider === 'none') return null;
  const definition = PROVIDERS[provider];
  const channel = channelFor(notification, provider);
  if (!channel || (category && !channel[MESSAGE_KEYS[category]])) return null;
  return definition.name;
}

export class NotificationService {
  static async send(request: NotificationRequest): Promise<NotificationResult> {
    const provider = request.notification.provider;
    if (!provider || provider === 'none') return { sent: false, provider: null };

    const definition = PROVIDERS[provider];
    const channel = channelFor(request.notification, provider);
    if (!channel) throw new Error(`${definition.name} notification configuration is missing.`);

    await definition.send({
      channel,
      title: request.title.trim() || 'Snapshot Sensors',
      message: request.message,
      sound: request.sound,
    });
    return { sent: true, provider: definition.name };
  }

  static messageFor(channel: NotificationChannel, category: NotificationCategory): string | undefined {
    return channel[MESSAGE_KEYS[category]] as string | undefined;
  }

  static soundFor(channel: NotificationChannel, category: NotificationCategory): string | undefined {
    return channel[SOUND_KEYS[category]] as string | undefined;
  }
}
