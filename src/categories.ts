import type { Category } from './types.js';

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

export function sensorName(labels: Category[]): string {
  const names = [...labels].sort().map(capitalize);
  if (names.length === 1) return `${names[0]} Sensor`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} Sensor`;
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
