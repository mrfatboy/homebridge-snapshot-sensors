import { describe, it, expect } from 'vitest';
import { scoreCategories, detectCategories, matchingSensors } from '../src/detector.js';
import { categoryOfClass } from '../src/categories.js';
import type { Detection, SensorSpec } from '../src/types.js';

const det = (classId: number, score: number, w = 200, h = 200): Detection => {
  return { x1: 0, y1: 0, x2: w, y2: h, score, classId, className: '' };
};

const sensor = (categories: SensorSpec['categories'], thresholds: SensorSpec['thresholds']): SensorSpec => ({
  name: 'Test Sensor', categories, thresholds,
});

describe('categoryOfClass()', () => {
  it('maps representative COCO ids to the right category', () => {
    expect(categoryOfClass(0)).toBe('people');
    expect(categoryOfClass(15)).toBe('animals');
    expect(categoryOfClass(2)).toBe('vehicles');
  });

  it('returns null for an unmapped class id', () => {
    expect(categoryOfClass(9)).toBeNull();
    expect(categoryOfClass(99)).toBeNull();
    expect(categoryOfClass(24)).toBeNull();
  });
});

describe('scoreCategories()', () => {
  it('returns the highest score seen per category', () => {
    const scores = scoreCategories([det(15, 0.4), det(16, 0.8), det(0, 0.6)]);
    expect(scores.get('animals')).toBe(0.8);
    expect(scores.get('people')).toBe(0.6);
    expect(scores.has('vehicles')).toBe(false);
  });

  it('does not reject detections based on bounding-box size', () => {
    expect(scoreCategories([det(0, 0.99, 10, 10)]).get('people')).toBe(0.99);
  });

  it('ignores detections of unmapped classes', () => {
    expect(scoreCategories([det(9, 0.9)]).size).toBe(0);
  });

  it('keeps low scores for the caller to filter', () => {
    expect(scoreCategories([det(0, 0.1)]).get('people')).toBe(0.1);
  });
});

describe('matchingSensors()', () => {
  it('applies the configured threshold independently for each category', () => {
    const s = sensor(['animals', 'people', 'vehicles'], { animals: 0.4, people: 0.25, vehicles: 0.55 });
    expect(matchingSensors([det(15, 0.35), det(0, 0.25), det(2, 0.54)], [s])).toHaveLength(1);
    expect(matchingSensors([det(15, 0.4), det(0, 0.25), det(2, 0.55)], [s])).toHaveLength(1);
    expect(matchingSensors([det(15, 0.39), det(0, 0.24), det(2, 0.54)], [s])).toHaveLength(0);
  });

  it('matches a detection regardless of bounding-box size', () => {
    const s = sensor(['people'], { people: 0.25 });
    expect(matchingSensors([det(0, 0.8, 10, 10)], [s])).toHaveLength(1);
  });
});

describe('detectCategories()', () => {
  it('includes only categories at or above the supplied threshold', () => {
    const cats = detectCategories([det(0, 0.5), det(15, 0.49)], 0.5);
    expect(cats.has('people')).toBe(true);
    expect(cats.has('animals')).toBe(false);
  });

  it('returns an empty set when nothing clears the threshold', () => {
    expect(detectCategories([det(0, 0.2)], 0.5).size).toBe(0);
  });
});
