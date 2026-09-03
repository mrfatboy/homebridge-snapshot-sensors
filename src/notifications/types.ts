import type { NotificationChannel, NotificationConfig } from '../types.js';

export type NotificationProvider = Exclude<NotificationConfig['provider'], undefined | 'none'>;

export interface NotificationRequest {
  notification: NotificationConfig;
  title: string;
  message: string;
  sound?: string;
}

export interface NotificationProviderContext {
  channel: NotificationChannel;
  title: string;
  message: string;
  sound?: string;
}

export type NotificationProviderSender = (context: NotificationProviderContext) => Promise<void>;

export interface NotificationResult {
  sent: boolean;
  provider: string | null;
}
