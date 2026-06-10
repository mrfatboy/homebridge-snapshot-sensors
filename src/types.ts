export type Category = 'animals' | 'packages' | 'people' | 'vehicles';

// ── Config input shape (exactly what the GUI form emits; the only accepted form) ─
// A sensor fires when ANY selected category is detected at or above `threshold`.
//   { categories: [...], name?, threshold? }
// Values are untrusted JSON, so every field is optional/loose here and validated
// in resolveSensors.
export interface RawSensor {
  name?: string;
  categories?: string[];
  threshold?: number;
  logStatus?: boolean;
}

export interface StreamConfig {
  name: string;
  url: string;
  sensors: RawSensor[];
}

// ── Resolved shape (internal; produced by resolveSensors) ──────────────────────
// One HomeKit motion sensor: fires when ANY category clears the threshold.
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
