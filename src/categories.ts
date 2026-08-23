import type { Category, RawSensor, SensorSpec } from './types.js';
import { THRESHOLD } from './settings.js';
import { YOLO26_CLASSES, type Yolo26ClassName } from '../model/yolo26/classes.js';

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function idOf(name: Yolo26ClassName): number {
  return YOLO26_CLASSES.indexOf(name);
}

// COCO class IDs mapped to each detection category.
// 'packages' is approximate — COCO has no delivery-parcel class.
export const CATEGORY_CLASS_IDS: Record<Category, ReadonlySet<number>> = {
  animals: new Set([idOf('bird'), idOf('cat'), idOf('dog'), idOf('horse'), idOf('sheep'), idOf('cow'), idOf('elephant'), idOf('bear'), idOf('zebra'), idOf('giraffe')]),
  people: new Set([idOf('person')]),
  vehicles: new Set([idOf('bicycle'), idOf('car'), idOf('motorcycle'), idOf('bus'), idOf('train'), idOf('truck'), idOf('boat')]),
  packages: new Set([idOf('backpack'), idOf('handbag'), idOf('suitcase')]),
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

export function resolveSensors(
  snapshotName: string,
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
      warn(
        `Sensor ${raw?.name ? `"${raw.name}"` : JSON.stringify(raw)} has no valid categories, skipping`,
      );
      continue;
    }

    let threshold = raw?.threshold ?? THRESHOLD;
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      warn(`Threshold "${threshold}" is out of range [0, 1]; using ${THRESHOLD}`);
      threshold = THRESHOLD;
    }

    const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
    const label = name || `${snapshotName} ${sensorName(categories)}`;

    resolved.push({
      name: label,
      categories,
      threshold,
      logStatus: raw?.logStatus === true,
    });
  }

  return resolved;
}

export function categoryOfClass(classId: number): Category | null {
  for (const [cat, ids] of Object.entries(CATEGORY_CLASS_IDS) as [
    Category,
    ReadonlySet<number>,
  ][]) {
    if (ids.has(classId)) return cat;
  }
  return null;
}
