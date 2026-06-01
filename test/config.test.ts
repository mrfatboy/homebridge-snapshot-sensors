import { describe, it, expect } from 'vitest';
import { isCategory, sensorName } from '../src/categories.js';
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
    expect(`Garden ${sensorName(['animals'])}`).toBe('Garden Animals');
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
    expect(sensorName(['animals'])).toBe('Animals');
    expect(sensorName(['people'])).toBe('People');
    expect(sensorName(['vehicles'])).toBe('Vehicles');
    expect(sensorName(['packages'])).toBe('Packages');
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
