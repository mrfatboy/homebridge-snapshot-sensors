import type { Detection, Category } from './types.js';
import { categoryOfClass } from './categories.js';
import { THRESHOLD, AREA_MIN_FRAC, FRAME_WIDTH, FRAME_HEIGHT } from './settings.js';

export type CategoryScores = Map<Category, number>;

// Best (highest) confidence seen per category, among detections that clear the
// global area filter. Per-sensor score thresholds are applied later, so this
// keeps everything above THRESHOLD_KEEP (the model's retention floor) and lets
// the caller decide the cutoff. Categories with no qualifying detection are absent.
export function scoreCategories(detections: Detection[]): CategoryScores {
  const scores: CategoryScores = new Map();
  for (const d of detections) {
    const area = (d.x2 - d.x1) * (d.y2 - d.y1) / (FRAME_WIDTH * FRAME_HEIGHT);
    if (area < AREA_MIN_FRAC) continue;
    const cat = categoryOfClass(d.classId);
    if (cat === null) continue;
    if (d.score > (scores.get(cat) ?? 0)) scores.set(cat, d.score);
  }
  return scores;
}

// Categories that clear the default global threshold. Retained for tests and
// any caller that just wants "what's present" with the standard cutoff.
export function detectCategories(detections: Detection[]): Set<Category> {
  const found = new Set<Category>();
  for (const [cat, score] of scoreCategories(detections)) {
    if (score >= THRESHOLD) found.add(cat);
  }
  return found;
}
