import { describe, it, expect, vi } from 'vitest';
import { isCategory, sensorName, resolveSensors } from '../src/categories.js';
import type { Category } from '../src/types.js';

describe('isCategory()', () => {
  it('accepts all valid categories', () => {
    expect(isCategory('animals')).toBe(true);
    expect(isCategory('people')).toBe(true);
    expect(isCategory('vehicles')).toBe(true);
  });

  it('rejects the old singular spellings and related words', () => {
    expect(isCategory('animal')).toBe(false);
    expect(isCategory('person')).toBe(false);
    expect(isCategory('vehicle')).toBe(false);
    expect(isCategory('persons')).toBe(false);
    expect(isCategory('package')).toBe(false);
    expect(isCategory('packages')).toBe(false);
    expect(isCategory('cat')).toBe(false);
    expect(isCategory('')).toBe(false);
  });
});

describe('sensor name with stream prefix', () => {
  it('prepends the stream name to the sensor label', () => {
    expect(`Garden ${sensorName(['animals'])}`).toBe('Garden Animals Sensor');
    expect(`Front Door ${sensorName(['people', 'vehicles'])}`).toBe('Front Door People & Vehicles Sensor');
  });

  it('sensor label order does not affect the prefixed result', () => {
    const a = `Backyard ${sensorName(['people', 'animals'])}`;
    const b = `Backyard ${sensorName(['animals', 'people'])}`;
    expect(a).toBe(b);
    expect(a).toBe('Backyard Animals & People Sensor');
  });
});

describe('sensorName()', () => {
  it('returns the display name for a single category', () => {
    expect(sensorName(['animals'])).toBe('Animals Sensor');
    expect(sensorName(['people'])).toBe('People Sensor');
    expect(sensorName(['vehicles'])).toBe('Vehicles Sensor');
  });

  it('sorts alphabetically regardless of input order', () => {
    const ab: Category[] = ['people', 'animals'];
    const ba: Category[] = ['animals', 'people'];
    expect(sensorName(ab)).toBe(sensorName(ba));
    expect(sensorName(ba)).toBe('Animals & People Sensor');
  });

  it('joins three categories with Oxford-comma-less ampersand', () => {
    expect(sensorName(['vehicles', 'animals', 'people'])).toBe('Animals, People & Vehicles Sensor');
  });
});

describe('resolveSensors()', () => {
  const THRESHOLD = 0.5;

  it('one category, no name → auto-named with the stream prefix, default threshold', () => {
    const [s, ...rest] = resolveSensors('Garden', [{ categories: ['animals'] }], () => {});
    expect(rest).toHaveLength(0);
    expect(s).toEqual({ name: 'Garden Animals Sensor', categories: ['animals'], thresholds: { animals: THRESHOLD }, unidentifiedMotionActivity: true });
  });

  it('multiple categories → one OR-sensor, auto-named', () => {
    const [s] = resolveSensors('Garden', [{ categories: ['animals', 'people'] }], () => {});
    expect(s).toEqual({ name: 'Garden Animals & People Sensor', categories: ['animals', 'people'], thresholds: { animals: THRESHOLD, people: THRESHOLD }, unidentifiedMotionActivity: true });
  });

  it('applies category-specific thresholds to the sensor', () => {
    const [s] = resolveSensors('Garden', [{ categories: ['animals', 'vehicles'], thresholds: { animals: 0.3, vehicles: 0.7 } }], () => {});
    expect(s.thresholds).toEqual({ animals: 0.3, vehicles: 0.7 });
    expect(s.categories).toEqual(['animals', 'vehicles']);
  });

  it('explicit name is used verbatim (no stream prefix)', () => {
    const [s] = resolveSensors('Garden', [{ name: 'Front Door', categories: ['people'] }], () => {});
    expect(s).toEqual({ name: 'Front Door', categories: ['people'], thresholds: { people: THRESHOLD }, unidentifiedMotionActivity: true });
  });

  it('warns and drops unknown categories; skips a sensor left with none', () => {
    const warn = vi.fn();
    const out = resolveSensors('Garden', [{ categories: ['animals', 'banana'] }, { categories: ['banana'] }], warn);
    expect(out).toHaveLength(1);
    expect(out[0].categories).toEqual(['animals']);
    expect(warn).toHaveBeenCalled();
  });

  it('de-duplicates repeated categories', () => {
    const [s] = resolveSensors('Garden', [{ categories: ['animals', 'animals'] }], () => {});
    expect(s.categories).toEqual(['animals']);
  });

  it('a sensor with no categories is dropped with a warning', () => {
    const warn = vi.fn();
    const out = resolveSensors('Garden', [{ name: 'Empty' }], warn);
    expect(out).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('clamps an out-of-range category threshold back to the default', () => {
    const warn = vi.fn();
    const [s] = resolveSensors('Garden', [{ categories: ['animals'], thresholds: { animals: 5 } }], warn);
    expect(s.thresholds).toEqual({ animals: 0.5 });
    expect(warn).toHaveBeenCalled();
  });
});
