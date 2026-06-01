export type Category = 'animals' | 'packages' | 'people' | 'vehicles';

// ── Config input shapes (what users write; values are untrusted JSON) ──────────
// A sensor can be written three ways:
//   "animals"                                  one category
//   ["animals", "people"]                      fires on any listed category
//   { name, source: [{type, threshold?}, …] }  explicit name + per-source threshold
export type RawSource = string | { type: string; threshold?: number };
export type RawSensor = string | string[] | { name?: string; source?: RawSource[] };

export interface StreamConfig {
  name: string;
  url: string;
  sensors: RawSensor[];
}

// ── Resolved shapes (internal; produced by resolveSensors) ─────────────────────
// One category to watch for, with the confidence it must clear.
export interface SourceSpec {
  category: Category;
  threshold: number;
}

// One HomeKit motion sensor. Fires when ANY of its sources clears its threshold.
export interface SensorSpec {
  name: string;
  sources: SourceSpec[];
}

export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
}
