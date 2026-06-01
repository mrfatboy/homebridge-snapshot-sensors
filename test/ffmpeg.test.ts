import { describe, it, expect } from 'vitest';
import { takeLatestFrame } from '../src/ffmpeg.js';

const F = 6; // pretend a "frame" is 6 bytes for these tests
const frame = (fill: number): Buffer => Buffer.alloc(F, fill);

describe('takeLatestFrame() — only ever keeps the newest frame', () => {
  it('returns null and keeps a partial frame untouched', () => {
    const partial = Buffer.from([1, 2, 3]);
    const { latest, rest } = takeLatestFrame(partial, F);
    expect(latest).toBeNull();
    expect(rest.equals(partial)).toBe(true);
  });

  it('returns the single frame and an empty remainder', () => {
    const { latest, rest } = takeLatestFrame(frame(7), F);
    expect(latest!.equals(frame(7))).toBe(true);
    expect(rest.length).toBe(0);
  });

  it('drops older frames and returns only the latest when several are buffered', () => {
    // three whole frames back-to-back: 0xAA, 0xBB, 0xCC
    const buf = Buffer.concat([frame(0xaa), frame(0xbb), frame(0xcc)]);
    const { latest, rest } = takeLatestFrame(buf, F);
    expect(latest!.equals(frame(0xcc))).toBe(true); // newest only
    expect(rest.length).toBe(0);
  });

  it('keeps trailing partial bytes after consuming whole frames', () => {
    const tail = Buffer.from([9, 9]);
    const buf = Buffer.concat([frame(0xaa), frame(0xbb), tail]);
    const { latest, rest } = takeLatestFrame(buf, F);
    expect(latest!.equals(frame(0xbb))).toBe(true);
    expect(rest.equals(tail)).toBe(true);
  });

  it('returns a standalone copy that does not alias the input buffer', () => {
    const buf = Buffer.concat([frame(0x11), frame(0x22)]);
    const { latest } = takeLatestFrame(buf, F);
    buf.fill(0); // mutating the source must not corrupt the returned frame
    expect(latest!.equals(frame(0x22))).toBe(true);
  });
});
