import type { Detection, Category, SensorSpec } from './types.js';
import { categoryOfClass } from './categories.js';
import { AREA_MIN_FRAC, FRAME_WIDTH, FRAME_HEIGHT } from './settings.js';

export type CategoryScores = Map<Category, number>;

// Best confidence seen per category after the internal area filter. No global
// confidence cutoff is applied here: each sensor applies its own configured
// threshold when deciding whether a detection qualifies.
export function scoreCategories(detections: Detection[]): CategoryScores {
  const scores: CategoryScores = new Map();
  for (const d of detections) {
    const area = ((d.x2 - d.x1) * (d.y2 - d.y1)) / (FRAME_WIDTH * FRAME_HEIGHT);
    if (area < AREA_MIN_FRAC) continue;
    const cat = categoryOfClass(d.classId);
    if (cat === null) continue;
    if (d.score > (scores.get(cat) ?? 0)) scores.set(cat, d.score);
  }
  return scores;
}

// Return the sensors for which at least one detection matches a configured
// category and meets that sensor's own confidence threshold.
export function matchingSensors(detections: Detection[], sensors: SensorSpec[]): SensorSpec[] {
  return sensors.filter(sensor => detections.some(detection => {
    const area = ((detection.x2 - detection.x1) * (detection.y2 - detection.y1)) /
      (FRAME_WIDTH * FRAME_HEIGHT);
    if (area < AREA_MIN_FRAC) return false;
    const category = categoryOfClass(detection.classId);
    return category !== null &&
      sensor.categories.includes(category) &&
      detection.score >= sensor.threshold;
  }));
}

// Categories that meet a supplied threshold. Retained for callers that need a
// simple category-level view without imposing a global threshold.
export function detectCategories(detections: Detection[], threshold = 0): Set<Category> {
  const found = new Set<Category>();
  for (const [cat, score] of scoreCategories(detections)) {
    if (score >= threshold) found.add(cat);
  }
  return found;
}
