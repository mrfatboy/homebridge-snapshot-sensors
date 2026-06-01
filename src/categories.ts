import type { Category, RawSensor, RawSource, SensorSpec, SourceSpec } from './types.js';
import { THRESHOLD } from './settings.js';

// Display labels are the category keys with the first letter capitalized.
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// COCO class IDs mapped to each HomeKit category.
// 'packages' is approximate — COCO has no delivery-parcel class.
export const CATEGORY_CLASS_IDS: Record<Category, ReadonlySet<number>> = {
  animals:  new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 23]), // bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe
  people:   new Set([0]),
  vehicles: new Set([1, 2, 3, 5, 6, 7, 8]),                   // bicycle, car, motorcycle, bus, train, truck, boat
  packages:  new Set([24, 26, 28]),                             // backpack, handbag, suitcase
};

export const VALID_CATEGORIES = Object.keys(CATEGORY_CLASS_IDS).join(', ');

export function sensorName(labels: Category[]): string {
  const names = [...new Set(labels)].sort().map(capitalize);
  if (names.length === 1) return `${names[0]} Sensor`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} Sensor`;
}

export function isCategory(s: string): s is Category {
  return s in CATEGORY_CLASS_IDS;
}

// Parse one source (a bare category string, or {type, threshold}) into a
// SourceSpec. Returns null and warns if the category is unknown; clamps an
// out-of-range threshold back to the global default.
function resolveSource(raw: RawSource, warn: (msg: string) => void): SourceSpec | null {
  const type = typeof raw === 'string' ? raw : raw.type;
  let threshold = typeof raw === 'string' ? THRESHOLD : raw.threshold ?? THRESHOLD;

  if (!isCategory(type)) {
    warn(`Unknown category "${type}" — valid values: ${VALID_CATEGORIES}`);
    return null;
  }
  if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
    warn(`Threshold "${threshold}" for "${type}" is out of range [0, 1]; using ${THRESHOLD}`);
    threshold = THRESHOLD;
  }
  return { category: type, threshold };
}

// Normalize every supported sensor shape into a SensorSpec.
//   "animals"                                  → auto-named, stream-prefixed
//   ["animals", "people"]                      → auto-named, stream-prefixed
//   { name, source: [{type, threshold?}, …] }  → explicit name used verbatim
// Invalid entries are warned about and dropped; name collisions are handled by
// the caller, which has the full cross-stream view.
export function resolveSensors(
  streamName: string,
  sensors: RawSensor[],
  warn: (msg: string) => void,
): SensorSpec[] {
  const resolved: SensorSpec[] = [];

  for (const raw of sensors) {
    if (typeof raw === 'string' || Array.isArray(raw)) {
      const list = Array.isArray(raw) ? raw : [raw];
      const sources: SourceSpec[] = [];
      for (const c of list) {
        const s = resolveSource(c, warn);
        if (s) sources.push(s);
      }
      if (sources.length === 0) {
        warn(`Sensor ${JSON.stringify(raw)} has no valid categories, skipping`);
        continue;
      }
      const label = sensorName(sources.map(s => s.category));
      resolved.push({ name: streamName ? `${streamName} ${label}` : label, sources });
    } else {
      const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        warn('A sensor object is missing a required "name", skipping');
        continue;
      }
      const sources: SourceSpec[] = [];
      for (const rs of raw.source ?? []) {
        const s = resolveSource(rs, warn);
        if (s) sources.push(s);
      }
      if (sources.length === 0) {
        warn(`Sensor "${name}" has no valid sources, skipping`);
        continue;
      }
      resolved.push({ name, sources });
    }
  }

  return resolved;
}

export function categoryOfClass(classId: number): Category | null {
  for (const [cat, ids] of Object.entries(CATEGORY_CLASS_IDS) as [Category, ReadonlySet<number>][]) {
    if (ids.has(classId)) return cat;
  }
  return null;
}
