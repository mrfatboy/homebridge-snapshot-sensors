import type { Detection, Category } from './types.js';
import { categoryOfClass } from './categories.js';
import { THRESHOLD, AREA_MIN_FRAC, FRAME_WIDTH, FRAME_HEIGHT } from './settings.js';

export function detectCategories(detections: Detection[]): Set<Category> {
  const found = new Set<Category>();
  for (const d of detections) {
    if (d.score < THRESHOLD) continue;
    const area = (d.x2 - d.x1) * (d.y2 - d.y1) / (FRAME_WIDTH * FRAME_HEIGHT);
    if (area < AREA_MIN_FRAC) continue;
    const cat = categoryOfClass(d.classId);
    if (cat !== null) found.add(cat);
  }
  return found;
}
