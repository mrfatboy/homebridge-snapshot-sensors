import type { Logger } from 'homebridge';
import { FfmpegPump } from './ffmpeg.js';
import { scoreCategories } from './detector.js';
import type { CategoryScores } from './detector.js';
import type { SensorSpec, Detection } from './types.js';
import { SAMPLE_MS, COOLDOWN_MS, AUTO_OFF_MS } from './settings.js';

export type SensorStateCallback = (sensorIndex: number, active: boolean) => void;
export type InferFn = (frame: Buffer) => Promise<Detection[]>;

export class StreamWorker {
  private readonly pump: FfmpegPump;
  private readonly lastTrigger: number[];
  private readonly autoOffTimers: (ReturnType<typeof setTimeout> | null)[];
  private running = true;
  private wakeUp: (() => void) | null = null;
  private loopDone: Promise<void> = Promise.resolve();

  constructor(
    url: string,
    private readonly sensors: SensorSpec[],
    private readonly onSensorState: SensorStateCallback,
    private readonly infer: InferFn,
    private readonly log: Logger,
  ) {
    this.pump = new FfmpegPump(url, log);
    this.lastTrigger = sensors.map(() => 0);
    this.autoOffTimers = sensors.map(() => null);
  }

  start(): void {
    this.pump.start();
    this.loopDone = this.loop();
  }

  stop(): void {
    this.running = false;
    this.wakeUp?.();          // interrupt any in-progress sleep immediately
    this.pump.stop();
    for (const t of this.autoOffTimers) {
      if (t !== null) clearTimeout(t);
    }
  }

  // Resolves once the detection loop has fully exited.
  // Await this before releasing shared resources (e.g. the ONNX session).
  waitForStop(): Promise<void> {
    return this.loopDone;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const frame = this.pump.takeFrame();
      if (!frame) {
        await this.sleep(50);
        continue;
      }

      const t0 = Date.now();
      try {
        const detections = await this.infer(frame);
        const scores = scoreCategories(detections);
        this.updateSensors(scores);
      } catch (e) {
        this.log.error('Detection error:', String(e));
      }

      const elapsed = Date.now() - t0;
      if (elapsed < SAMPLE_MS) await this.sleep(SAMPLE_MS - elapsed);
    }
  }

  // Interruptible sleep: resolves immediately if already stopped,
  // or can be cut short by stop() calling this.wakeUp().
  private sleep(ms: number): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      this.wakeUp = () => { clearTimeout(timer); resolve(); };
    });
  }

  private updateSensors(scores: CategoryScores): void {
    // Guard: stop() may have fired while inference was in-flight.
    if (!this.running) return;

    this.sensors.forEach((sensor, i) => {
      // Sensor fires when ANY source clears its own threshold.
      const triggered = sensor.sources.some(s => (scores.get(s.category) ?? 0) >= s.threshold);
      if (!triggered) return;

      const now = Date.now();
      if (now - this.lastTrigger[i] < COOLDOWN_MS) return;
      this.lastTrigger[i] = now;

      this.onSensorState(i, true);

      const prev = this.autoOffTimers[i];
      if (prev !== null) clearTimeout(prev);
      this.autoOffTimers[i] = setTimeout(() => {
        this.onSensorState(i, false);
        this.autoOffTimers[i] = null;
      }, AUTO_OFF_MS);
    });
  }
}

