export type Category = 'animals' | 'people' | 'vehicles';
export type StoreSnapshots = 'never' | 'normal' | 'annotated';

export interface NotificationChannel {
  token?: string;
  user?: string;
  device?: string;
  title?: string;
  animalMessage?: string;
  animalSound?: string;
  personMessage?: string;
  personSound?: string;
  vehicleMessage?: string;
  vehicleSound?: string;
  unidentifiedMessage?: string;
  unidentifiedSound?: string;
  apiKey?: string;
  deviceIden?: string;
  email?: string;
  channelTag?: string;
  server?: string;
  topic?: string;
  accessToken?: string;
  priority?: number;
  tags?: string;
  privateKey?: string;
  pushsaferDevice?: string;
  icon?: number;
  vibration?: number;
  iconColor?: string;
  url?: string;
  urlTitle?: string;
  timeToLive?: number;
  retry?: number;
  expire?: number;
}

export interface NotificationConfig {
  provider?: 'none' | 'pushover' | 'pushbullet' | 'ntfy' | 'pushsafer';
  pushover?: NotificationChannel;
  pushbullet?: NotificationChannel;
  ntfy?: NotificationChannel;
  pushsafer?: NotificationChannel;
}

export interface RawSensor {
  name?: string;
  categories?: string[];
  thresholds?: Partial<Record<Category, number>>;
}

export interface SnapshotConfig {
  name: string;
  url: string;
  snapshotDirectory?: string;
  snapshotOwnership?: string;
  storeSnapshots?: StoreSnapshots;
  snapshotPrefix?: string;
  sensors: RawSensor[];
  notifications?: NotificationConfig;
}

export interface SensorSpec {
  name: string;
  categories: Category[];
  thresholds: Partial<Record<Category, number>>;
}

export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
  className: string;
}
