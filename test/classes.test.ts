import { describe, it, expect } from 'vitest';
import { YOLO26_CLASSES, getYolo26ClassName } from '../model/yolo26/classes.js';

describe('getYolo26ClassName()', () => {
  it('returns the first class for id 0', () => {
    expect(getYolo26ClassName(0)).toBe('person');
  });

  it('returns the last class for the last valid id', () => {
    const lastId = YOLO26_CLASSES.length - 1;
    expect(getYolo26ClassName(lastId)).toBe(YOLO26_CLASSES[lastId]);
  });

  it('throws for a negative class id', () => {
    expect(() => getYolo26ClassName(-1)).toThrow('out of range');
  });

  it('throws for an out-of-range class id', () => {
    expect(() => getYolo26ClassName(YOLO26_CLASSES.length)).toThrow('out of range');
  });

  it('throws for a non-integer class id', () => {
    expect(() => getYolo26ClassName(1.5)).toThrow('Invalid class id');
  });
});
