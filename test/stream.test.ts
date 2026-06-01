import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamWorker } from '../src/stream.js';
import type { StreamConfig, Detection } from '../src/types.js';

// Store each FfmpegPump instance so tests can control it.
const pumpInstances: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; takeFrame: ReturnType<typeof vi.fn> }[] = [];

vi.mock('../src/ffmpeg.js', () => ({
  FfmpegPump: vi.fn(function(this: typeof pumpInstances[number]) {
    this.start = vi.fn();
    this.stop = vi.fn();
    this.takeFrame = vi.fn().mockReturnValue(null);
    pumpInstances.push(this);
  }),
}));

const config: StreamConfig = {
  name: 'Test',
  url: 'rtsp://test/stream',
  sensors: [['animals'], ['people']],
};

const fakeLog = {
  warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn(), success: vi.fn(),
} as never;

// Default infer stub: no detections.
const noDetections = (): Promise<Detection[]> => Promise.resolve([]);

beforeEach(() => {
  pumpInstances.length = 0;
  vi.clearAllMocks();
});

describe('StreamWorker.stop()', () => {
  it('interrupts the sleep so the loop exits well under SAMPLE_MS', async () => {
    const worker = new StreamWorker(config, () => {}, noDetections, fakeLog);
    worker.start();

    const t0 = Date.now();
    worker.stop();
    await new Promise(r => setImmediate(r));

    expect(Date.now() - t0).toBeLessThan(200); // SAMPLE_MS is 2000ms
  });

  it('waitForStop() resolves promptly even when inference was in-flight at stop()', async () => {
    // infer that takes 100ms — longer than any reasonable loop overhead.
    const slowInfer = (): Promise<Detection[]> =>
      new Promise(res => setTimeout(() => res([]), 100));

    const worker = new StreamWorker(config, () => {}, slowInfer, fakeLog);
    pumpInstances[0]?.takeFrame.mockReturnValueOnce(Buffer.alloc(1024 * 576 * 3));
    worker.start();

    await new Promise(r => setImmediate(r)); // let loop reach infer()
    worker.stop();

    const t0 = Date.now();
    await worker.waitForStop();

    // Must resolve within the infer duration (~100ms) plus margin,
    // NOT after SAMPLE_MS (2000ms) which the old code would have waited.
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('does not schedule autoOff timers when stop() fires during inference', async () => {
    // infer resolves an animal detection only after we let it.
    let resolveInfer!: () => void;
    const gatedInfer = (): Promise<Detection[]> =>
      new Promise(res => {
        resolveInfer = () => res([{ x1: 0, y1: 0, x2: 200, y2: 200, score: 0.9, classId: 15 }]);
      });

    const sensorEvents: Array<[number, boolean]> = [];
    const worker = new StreamWorker(
      config,
      (i, active) => sensorEvents.push([i, active]),
      gatedInfer,
      fakeLog,
    );

    pumpInstances[0]?.takeFrame.mockReturnValueOnce(Buffer.alloc(1024 * 576 * 3));
    worker.start();

    // Give the loop time to reach the infer() await.
    await new Promise(r => setImmediate(r));

    // stop() while inference is pending.
    worker.stop();

    // Now let inference resolve (after stop).
    resolveInfer();
    await new Promise(r => setTimeout(r, 50));

    // updateSensors should have returned early — no autoOff (false) event.
    const autoOffFires = sensorEvents.filter(([, active]) => !active);
    expect(autoOffFires).toHaveLength(0);
  });
});
