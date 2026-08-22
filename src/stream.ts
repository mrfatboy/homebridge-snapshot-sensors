import type { Logger } from 'homebridge';
import { scoreCategories } from './detector.js';
import type { CategoryScores } from './detector.js';
import type { SensorSpec, Detection, StreamHealth, StoreSnapshots } from './types.js';
import { SAMPLE_MS } from './settings.js';
import { fetchSnapshot, saveSnapshot } from './snapshot.js';
import { runYolo } from './yolo.js';

export type SensorStateCallback = (sensorIndex: number, active: boolean) => void;
export type StreamHealthCallback = (health: StreamHealth) => void;

export class StreamWorker {
  private running = true;
  private wakeUp: (() => void) | null = null;
  private loopDone: Promise<void> = Promise.resolve();
  private health: StreamHealth = 'connecting';

  constructor(
    private readonly url: string,
    private readonly name: string,
    private readonly sensors: SensorSpec[],
    private readonly storeSnapshots: StoreSnapshots,
    private readonly snapshotDirectory: string,
    private readonly snapshotPrefix: string,
    private readonly onSensorState: SensorStateCallback,
    private readonly onHealth: StreamHealthCallback,
    private readonly log: Logger,
  ) {}

  start(): void {
    this.loopDone = this.loop();
  }

  stop(): void {
    this.running = false;
    this.wakeUp?.();
  }

  waitForStop(): Promise<void> {
    return this.loopDone;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const t0 = Date.now();
      try {
        this.setHealth('connecting');
        const image = await fetchSnapshot(this.url);
        if (!this.running) return;

        const result = await runYolo(image, this.storeSnapshots, this.log);
        if (!this.running) return;

        const detections = result.detections;
        const scores = scoreCategories(detections);
        this.logScores(scores);
        this.updateSensors(scores);
        this.setHealth('online');

        if (this.storeSnapshots === 'normal') {
          await saveSnapshot(image, this.snapshotDirectory, this.snapshotPrefix, '.jpg', this.log);
        } else if (this.storeSnapshots === 'annotated') {
          if (!result.annotatedImage) {
            this.log.warn('YOLO did not return an annotated image; the analyzed snapshot was not saved');
          } else {
            await saveSnapshot(result.annotatedImage, this.snapshotDirectory, this.snapshotPrefix, '.jpg', this.log);
          }
        }
      } catch (error) {
        this.setHealth('down');
        this.log.error(`Snapshot detection error for ${this.name}:`, String(error));
      }

      const elapsed = Date.now() - t0;
      if (elapsed < SAMPLE_MS) await this.sleep(SAMPLE_MS - elapsed);
    }
  }

  private setHealth(health: StreamHealth): void {
    if (health === this.health) return;
    this.health = health;
    this.onHealth(health);
  }

  private sleep(ms: number): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.wakeUp = () => {
        clearTimeout(timer);
        resolve();
      };
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
      const detected = sensor.categories.some((c) => (scores.get(c) ?? 0) >= sensor.threshold);
      this.onSensorState(i, detected);
    });
  }
}
