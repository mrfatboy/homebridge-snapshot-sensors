import { describe, it, expect } from 'vitest';
import { isCategory, sensorName } from '../src/categories.js';
import type { Category } from '../src/types.js';

describe('isCategory()', () => {
  it('accepts all four valid categories', () => {
    expect(isCategory('animal')).toBe(true);
    expect(isCategory('package')).toBe(true);
    expect(isCategory('person')).toBe(true);
    expect(isCategory('vehicle')).toBe(true);
  });

  it('rejects common misspellings and related words', () => {
    expect(isCategory('people')).toBe(false);  // the bug from the field
    expect(isCategory('animals')).toBe(false);
    expect(isCategory('persons')).toBe(false);
    expect(isCategory('vehicles')).toBe(false);
    expect(isCategory('packages')).toBe(false);
    expect(isCategory('cat')).toBe(false);
    expect(isCategory('')).toBe(false);
  });
});

describe('sensor name with stream prefix', () => {
  it('prepends the stream name to the sensor label', () => {
    expect(`Garden ${sensorName(['animal'])}`).toBe('Garden Animals');
    expect(`Front Door ${sensorName(['person', 'vehicle'])}`).toBe('Front Door People & Vehicles');
  });

  it('sensor label order does not affect the prefixed result', () => {
    const a = `Backyard ${sensorName(['person', 'animal'])}`;
    const b = `Backyard ${sensorName(['animal', 'person'])}`;
    expect(a).toBe(b);
    expect(a).toBe('Backyard Animals & People');
  });
});

describe('sensorName()', () => {
  it('returns the display name for a single category', () => {
    expect(sensorName(['animal'])).toBe('Animals');
    expect(sensorName(['person'])).toBe('People');
    expect(sensorName(['vehicle'])).toBe('Vehicles');
    expect(sensorName(['package'])).toBe('Packages');
  });

  it('sorts alphabetically regardless of input order', () => {
    const ab: Category[] = ['person', 'animal'];
    const ba: Category[] = ['animal', 'person'];
    expect(sensorName(ab)).toBe(sensorName(ba));
    expect(sensorName(ba)).toBe('Animals & People');
  });

  it('joins three categories with Oxford-comma-less ampersand', () => {
    expect(sensorName(['vehicle', 'animal', 'person'])).toBe('Animals, People & Vehicles');
  });

  it('joins all four categories', () => {
    expect(sensorName(['animal', 'package', 'person', 'vehicle'])).toBe(
      'Animals, Packages, People & Vehicles',
    );
  });
});
