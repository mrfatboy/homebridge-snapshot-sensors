import type { Category } from './types.js';

const DISPLAY: Record<Category, string> = {
  animal: 'Animals',
  package: 'Packages',
  person: 'People',
  vehicle: 'Vehicles',
};

// COCO class IDs mapped to each HomeKit category.
// 'package' is approximate — COCO has no delivery-parcel class.
export const CATEGORY_CLASS_IDS: Record<Category, ReadonlySet<number>> = {
  animal:  new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 23]), // bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe
  person:  new Set([0]),
  vehicle: new Set([1, 2, 3, 5, 6, 7, 8]),                   // bicycle, car, motorcycle, bus, train, truck, boat
  package: new Set([24, 26, 28]),                             // backpack, handbag, suitcase
};

export function sensorName(labels: Category[]): string {
  const names = [...labels].sort().map(l => DISPLAY[l]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function isCategory(s: string): s is Category {
  return s in CATEGORY_CLASS_IDS;
}

export function categoryOfClass(classId: number): Category | null {
  for (const [cat, ids] of Object.entries(CATEGORY_CLASS_IDS) as [Category, ReadonlySet<number>][]) {
    if (ids.has(classId)) return cat;
  }
  return null;
}
