/**
 * End-to-end tests using real fox footage frames extracted into test/fixtures/.
 * Raw 1024×576 RGB24 buffers — identical input the production pipeline receives.
 *
 * Fixture provenance (confirmed via debug scan before saving):
 *   ir-dark.rgb    Feb-23-2026 4:46 AM t=10s  — pure dark IR (lum≈67, chroma=0)
 *   ir-bright.rgb  Feb-23-2026 4:55 AM t=5s   — bright IR, outdoor light on (lum≈135, chroma=0)
 *   color.rgb      May-29-2026 8:01 AM t=5s   — daylight color
 *   fox-ir-mixed.rgb  Feb-23-2026 4:55 AM t=8s  — IR phase, bird 0.85
 *   fox-dawn.rgb      May-26-2026 4:30 AM t=6s  — dawn color, sheep 0.60
 *   fox-day-1.rgb     May-29-2026 8:01 AM t=4s  — daylight, dog 0.53
 *   fox-day-2.rgb     May-29-2026 8:02 AM t=36s — daylight, bird 0.72
 *   fox-ir-dark.rgb   DFD03007          t≈8s    — dark IR, cat 0.62
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadModel, runInference } from '../src/inference.js';
import { detectCategories } from '../src/detector.js';
import { normalizeFrame } from '../src/ir.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string): Buffer => readFileSync(join(FIXTURES, name));

beforeAll(async () => {
  await loadModel();
});

// ─── IR normalization ─────────────────────────────────────────────────────────

describe('IR normalization', () => {
  it('enhances dark IR frames (lum≈67, chroma=0)', () => {
    const frame = fixture('ir-dark.rgb');
    const original = Buffer.from(frame);
    normalizeFrame(frame);
    expect(frame.equals(original)).toBe(false);
  });

  it('leaves bright IR frames unchanged (lum≈135, chroma=0 — outdoor light on)', () => {
    // isIRFrame returns false: lum=135 is in (90..200) even with zero chroma
    const frame = fixture('ir-bright.rgb');
    const original = Buffer.from(frame);
    normalizeFrame(frame);
    expect(frame.equals(original)).toBe(true);
  });

  it('leaves daylight color frames unchanged', () => {
    const frame = fixture('color.rgb');
    const original = Buffer.from(frame);
    normalizeFrame(frame);
    expect(frame.equals(original)).toBe(true);
  });
});

// ─── Fox detection ────────────────────────────────────────────────────────────

describe('Fox detection', () => {
  // fox-ir-mixed: Feb-23 4:55 AM in the bright-IR phase — YOLO sees it as bird (0.85)
  it('IR phase (bright IR, outdoor light on) — Feb-23 4:55 AM', async () => {
    const cats = detectCategories(await runInference(fixture('fox-ir-mixed.rgb')));
    expect(cats.has('animal')).toBe(true);
  });

  // fox-dawn: May-26 4:30 AM, dawn color — YOLO sees sheep (0.60)
  it('dawn color — May-26 4:30 AM', async () => {
    const cats = detectCategories(await runInference(fixture('fox-dawn.rgb')));
    expect(cats.has('animal')).toBe(true);
  });

  // fox-day-1: May-29 8:01 AM, daylight — YOLO sees dog (0.53)
  it('daylight — May-29 8:01 AM', async () => {
    const cats = detectCategories(await runInference(fixture('fox-day-1.rgb')));
    expect(cats.has('animal')).toBe(true);
  });

  // fox-day-2: May-29 8:02 AM, daylight — YOLO sees bird (0.72)
  it('daylight (long clip) — May-29 8:02 AM', async () => {
    const cats = detectCategories(await runInference(fixture('fox-day-2.rgb')));
    expect(cats.has('animal')).toBe(true);
  });

  // fox-ir-dark: DFD03007 dark IR — YOLO sees cat (0.62)
  it('dark IR — DFD03007', async () => {
    const cats = detectCategories(await runInference(fixture('fox-ir-dark.rgb')));
    expect(cats.has('animal')).toBe(true);
  });

  // Feb-23 4:46 AM: COCO-trained YOLO misclassifies this fox as "fire hydrant" in all frames.
  // Asserting false here acts as a regression test — if the model ever improves, update this.
  it('dark IR — Feb-23 4:46 AM (COCO model classifies fox as fire hydrant, not animal)', async () => {
    const cats = detectCategories(await runInference(fixture('ir-dark.rgb')));
    expect(cats.has('animal')).toBe(false);
  });
});
