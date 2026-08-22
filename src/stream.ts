import type { Logger } from 'homebridge';
import { FfmpegPump } from './ffmpeg.js';
import { scoreCategories } from './detector.js';
import type { CategoryScores } from './detector.js';
import type { SensorSpec, StreamHealth, StoreSnapshots } from './types.js';
import { SAMPLE_MS } from './settings.js';
import { saveSnapshot } from './snapshot.js';
import { runYolo } from './yolo.js';

export type SensorStateCallback = (sensorIndex: number, active: boolean) => void;
export type StreamHealthCallback = (health: StreamHealth) => void;

export class StreamWorker {
  private readonly pump: FfmpegPump;
  private running = true;
  private wakeUp: (() => void) | null = null;
  private loopDone: Promise<void> = Promise.resolve();

  constructor(
    url: string,
    name: string,
    private readonly sensors: SensorSpec[],
    private readonly storeSnapshots: StoreSnapshots,
    private readonly snapshotDirectory: string,
    private readonly snapshotPrefix: string,
    private readonly onSensorState: SensorStateCallback,
    onHealth: StreamHealthCallback,
    private readonly log: Logger,
  ) {
    this.pump = new FfmpegPump(url, name, log, onHealth);
  }

  start(): void { this.pump.start(); this.loopDone = this.loop(); }

  stop(): void { this.running = false; this.wakeUp?.(); this.pump.stop(); }

  waitForStop(): Promise<void> { return this.loopDone; }

  private async loop(): Promise<void> {
    while (this.running) {
      const image = this.pump.takeFrame();
      if (!image) { await this.sleep(50); continue; }
      const t0 = Date.now();
      try {
        const result = await runYolo(image, this.storeSnapshots);
        if (!this.running) return;
        const scores = scoreCategories(result.detections);
        this.logScores(scores);
        this.updateSensors(scores);
        if (this.storeSnapshots === 'normal') {
          await saveSnapshot(image, this.snapshotDirectory, this.snapshotPrefix, '.jpg', this.log);
        } else if (this.storeSnapshots === 'annotated' && result.annotatedImage) {
          await saveSnapshot(result.annotatedImage, this.snapshotDirectory, this.snapshotPrefix, '.jpg', this.log);
        }
      } catch (e) {
        this.log.error('Detection error:', String(e));
      }
      const elapsed = Date.now() - t0;
      if (elapsed < SAMPLE_MS) await this.sleep(SAMPLE_MS - elapsed);
    }
  }

  private sleep(ms: number): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(resolve, ms);
      this.wakeUp = () => { clearTimeout(timer); resolve(); };
    });
  }

  private logScores(scores: CategoryScores): void {
    if (scores.size === 0) return;
    const summary = [...scores.entries()].map(([c, s]) => `${c} ${s.toFixed(2)}`).join(', ');
    this.log.debug(`Detection scores: ${summary}`);
  }

  private updateSensors(scores: CategoryScores): void {
    if (!this.running) return;
    this.sensors.forEach((sensor, i) => {
      const detected = sensor.categories.some(c => (scores.get(c) ?? 0) >= sensor.threshold);
      this.onSensorState(i, detected);
    });
  }
}
