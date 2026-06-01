import { describe, it, expect, vi } from 'vitest';
import { isCategory, sensorName, resolveSensors } from '../src/categories.js';
import type { Category } from '../src/types.js';

describe('isCategory()', () => {
  it('accepts all four valid categories', () => {
    expect(isCategory('animals')).toBe(true);
    expect(isCategory('packages')).toBe(true);
    expect(isCategory('people')).toBe(true);
    expect(isCategory('vehicles')).toBe(true);
  });

  it('rejects the old singular spellings and related words', () => {
    expect(isCategory('animal')).toBe(false);
    expect(isCategory('person')).toBe(false);
    expect(isCategory('vehicle')).toBe(false);
    expect(isCategory('persons')).toBe(false);
    expect(isCategory('package')).toBe(false);
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
    expect(sensorName(['packages'])).toBe('Packages Sensor');
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

  it('joins all four categories', () => {
    expect(sensorName(['animals', 'packages', 'people', 'vehicles'])).toBe(
      'Animals, Packages, People & Vehicles Sensor',
    );
  });
});

describe('resolveSensors()', () => {
  const THRESHOLD = 0.5;

  it('resolves a bare string into a stream-prefixed, default-threshold sensor', () => {
    const [s, ...rest] = resolveSensors('Garden', ['animals'], () => {});
    expect(rest).toHaveLength(0);
    expect(s.name).toBe('Garden Animals Sensor');
    expect(s.sources).toEqual([{ category: 'animals', threshold: THRESHOLD }]);
  });

  it('resolves a category array into one OR-sensor with all sources', () => {
    const [s] = resolveSensors('Garden', [['animals', 'people']], () => {});
    expect(s.name).toBe('Garden Animals & People Sensor');
    expect(s.sources).toEqual([
      { category: 'animals', threshold: THRESHOLD },
      { category: 'people', threshold: THRESHOLD },
    ]);
  });

  it('resolves the object form: verbatim name (no prefix) + per-source threshold', () => {
    const [s] = resolveSensors('Garden', [
      { name: 'Animals & People Quirky Sensor', source: [{ type: 'animals', threshold: 0.25 }, 'people'] },
    ], () => {});
    expect(s.name).toBe('Animals & People Quirky Sensor'); // NOT prefixed
    expect(s.sources).toEqual([
      { category: 'animals', threshold: 0.25 },
      { category: 'people', threshold: THRESHOLD },
    ]);
  });

  it('handles all three forms together', () => {
    const out = resolveSensors('Garden', [
      'animals',
      ['animals', 'people'],
      { name: 'Quirky', source: [{ type: 'animals', threshold: 0.25 }] },
    ], () => {});
    expect(out.map(s => s.name)).toEqual([
      'Garden Animals Sensor',
      'Garden Animals & People Sensor',
      'Quirky',
    ]);
  });

  it('warns and drops unknown categories; skips a sensor left empty', () => {
    const warn = vi.fn();
    const out = resolveSensors('Garden', [['animals', 'banana'], ['banana']], warn);
    expect(out).toHaveLength(1);
    expect(out[0].sources).toEqual([{ category: 'animals', threshold: THRESHOLD }]);
    expect(warn).toHaveBeenCalled();
  });

  it('warns and drops an object sensor missing its name', () => {
    const warn = vi.fn();
    const out = resolveSensors('Garden', [{ source: ['animals'] } as never], warn);
    expect(out).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('name'));
  });

  it('clamps an out-of-range threshold back to the default', () => {
    const warn = vi.fn();
    const [s] = resolveSensors('Garden', [
      { name: 'Bad', source: [{ type: 'animals', threshold: 5 }] },
    ], warn);
    expect(s.sources[0].threshold).toBe(THRESHOLD);
    expect(warn).toHaveBeenCalled();
  });
});
