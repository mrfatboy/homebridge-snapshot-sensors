import type { Detection, Category, SensorSpec } from './types.js';
import { categoryOfClass } from './categories.js';

export type CategoryScores = Map<Category, number>;

export function scoreCategories(detections: Detection[]): CategoryScores {
  const scores: CategoryScores = new Map();
  for (const d of detections) {
    const cat = categoryOfClass(d.classId);
    if (cat === null) continue;
    if (d.score > (scores.get(cat) ?? 0)) scores.set(cat, d.score);
  }
  return scores;
}

export function matchingSensors(detections: Detection[], sensors: SensorSpec[]): SensorSpec[] {
  return sensors.filter(sensor => detections.some(detection => {
    const category = categoryOfClass(detection.classId);
    const threshold = category === null ? undefined : sensor.thresholds[category];
    return category !== null && sensor.categories.includes(category) && detection.score >= (threshold ?? 0.25);
  }));
}

export function detectCategories(detections: Detection[], threshold = 0): Set<Category> {
  const found = new Set<Category>();
  for (const [cat, score] of scoreCategories(detections)) {
    if (score >= threshold) found.add(cat);
  }
  return found;
}
