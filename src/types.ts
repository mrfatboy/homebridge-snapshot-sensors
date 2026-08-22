export type Category = 'animals' | 'packages' | 'people' | 'vehicles';
export type StoreSnapshots = 'never' | 'normal' | 'annotated';

export type StreamHealth = 'connecting' | 'online' | 'down';

export interface RawSensor {
  name?: string;
  categories?: string[];
  threshold?: number;
  logStatus?: boolean;
}

export interface StreamConfig {
  name: string;
  url: string;
  snapshotDirectory?: string;
  storeSnapshots?: StoreSnapshots;
  snapshotPrefix?: string;
  sensors: RawSensor[];
}

export interface SensorSpec {
  name: string;
  categories: Category[];
  threshold: number;
  logStatus: boolean;
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
