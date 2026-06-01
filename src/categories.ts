import type { Category, RawSensor, SensorSpec } from './types.js';
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

// Normalize one raw sensor — { categories, name?, threshold? } — into a
// SensorSpec. The sensor fires when ANY listed category is detected at or above
// `threshold`. Unknown categories are warned about and dropped; a sensor left
// with no valid category is skipped. An out-of-range threshold falls back to the
// default. Name is optional: blank → auto-named with the stream prefix; an
// explicit name is used verbatim. Name collisions are handled by the caller,
// which has the full cross-stream view.
export function resolveSensors(
  streamName: string,
  sensors: RawSensor[],
  warn: (msg: string) => void,
): SensorSpec[] {
  const resolved: SensorSpec[] = [];

  for (const raw of sensors) {
    const categories: Category[] = [];
    for (const c of raw?.categories ?? []) {
      if (isCategory(c)) {
        if (!categories.includes(c)) categories.push(c);
      } else {
        warn(`Unknown category "${c}" — valid values: ${VALID_CATEGORIES}`);
      }
    }

    if (categories.length === 0) {
      warn(`Sensor ${raw?.name ? `"${raw.name}"` : JSON.stringify(raw)} has no valid categories, skipping`);
      continue;
    }

    let threshold = raw?.threshold ?? THRESHOLD;
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      warn(`Threshold "${threshold}" is out of range [0, 1]; using ${THRESHOLD}`);
      threshold = THRESHOLD;
    }

    // Optional sensor name: blank → auto-named with the stream prefix; an
    // explicit name is used verbatim. (streamName is guaranteed non-empty: the
    // platform skips streams without a name before calling this.)
    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const label = name || `${streamName} ${sensorName(categories)}`;

    resolved.push({ name: label, categories, threshold });
  }

  return resolved;
}

export function categoryOfClass(classId: number): Category | null {
  for (const [cat, ids] of Object.entries(CATEGORY_CLASS_IDS) as [Category, ReadonlySet<number>][]) {
    if (ids.has(classId)) return cat;
  }
  return null;
}
