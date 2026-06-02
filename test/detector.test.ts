import { describe, it, expect } from 'vitest';
import { scoreCategories, detectCategories } from '../src/detector.js';
import { categoryOfClass } from '../src/categories.js';
import type { Detection } from '../src/types.js';
import { FRAME_WIDTH, FRAME_HEIGHT, AREA_MIN_FRAC } from '../src/settings.js';

// A box big enough to clear the area filter (AREA_MIN_FRAC of the frame).
// Min area = 0.002 * 1024 * 576 ≈ 1180 px²; a 200×200 box is ~34000 px².
const det = (classId: number, score: number, w = 200, h = 200): Detection => ({
  x1: 0, y1: 0, x2: w, y2: h, score, classId,
});

// Smallest box that still passes the filter, and the largest that fails it.
const MIN_AREA = AREA_MIN_FRAC * FRAME_WIDTH * FRAME_HEIGHT;

describe('categoryOfClass()', () => {
  it('maps representative COCO ids to the right category', () => {
    expect(categoryOfClass(0)).toBe('people');     // person
    expect(categoryOfClass(15)).toBe('animals');   // cat
    expect(categoryOfClass(2)).toBe('vehicles');   // car
    expect(categoryOfClass(24)).toBe('packages');  // backpack
  });

  it('returns null for an unmapped class id', () => {
    expect(categoryOfClass(9)).toBeNull();   // traffic light — intentionally unmapped
    expect(categoryOfClass(99)).toBeNull();  // out of range
  });
});

describe('scoreCategories()', () => {
  it('returns the highest score seen per category', () => {
    const scores = scoreCategories([
      det(15, 0.4),  // cat → animals
      det(16, 0.8),  // dog → animals (higher)
      det(0, 0.6),   // person → people
    ]);
    expect(scores.get('animals')).toBe(0.8);
    expect(scores.get('people')).toBe(0.6);
    expect(scores.has('vehicles')).toBe(false);
  });

  it('drops detections smaller than the area floor', () => {
    // A 10×10 box (100 px²) is well under the ~1180 px² minimum.
    const scores = scoreCategories([det(0, 0.99, 10, 10)]);
    expect(scores.has('people')).toBe(false);
  });

  it('keeps a box exactly at the area floor, drops one just under', () => {
    const side = Math.ceil(Math.sqrt(MIN_AREA)) + 1; // safely above the floor
    expect(scoreCategories([det(0, 0.9, side, side)]).has('people')).toBe(true);

    const small = Math.floor(Math.sqrt(MIN_AREA)) - 1; // safely below
    expect(scoreCategories([det(0, 0.9, small, small)]).has('people')).toBe(false);
  });

  it('ignores detections of unmapped classes', () => {
    const scores = scoreCategories([det(9, 0.9)]); // traffic light
    expect(scores.size).toBe(0);
  });

  it('keeps low scores (below the default threshold) for the caller to filter', () => {
    // scoreCategories itself does NOT apply THRESHOLD — only the area filter.
    const scores = scoreCategories([det(0, 0.1)]);
    expect(scores.get('people')).toBe(0.1);
  });

  it('returns an empty map for no detections', () => {
    expect(scoreCategories([]).size).toBe(0);
  });
});

describe('detectCategories()', () => {
  it('includes only categories at or above the default threshold (0.5)', () => {
    const cats = detectCategories([
      det(0, 0.5),   // person exactly at threshold → included
      det(15, 0.49), // cat just below → excluded
    ]);
    expect(cats.has('people')).toBe(true);
    expect(cats.has('animals')).toBe(false);
  });

  it('returns an empty set when nothing clears the threshold', () => {
    expect(detectCategories([det(0, 0.2)]).size).toBe(0);
  });
});
