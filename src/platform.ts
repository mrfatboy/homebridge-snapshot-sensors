import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { StreamSensorAccessory } from './accessory.js';
import { StreamWorker } from './stream.js';
import { loadModel, closeModel, runInference } from './inference.js';
import { sensorName, isCategory } from './categories.js';
import type { StreamConfig, Category } from './types.js';

const VALID_CATEGORIES = Object.keys({ animals: 1, packages: 1, people: 1, vehicles: 1 }).join(', ');

export class StreamSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly workers: StreamWorker[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.api.on('shutdown', () => {
      // Stop all workers (sets running=false, kills ffmpeg, interrupts sleeps),
      // then wait for every detection loop to exit before releasing the model —
      // guarantees no runInference() call is in-flight at release.
      const draining = this.workers.map(w => { w.stop(); return w.waitForStop(); });
      this.workers.length = 0;
      Promise.all(draining)
        .then(() => closeModel())
        .catch(err => this.log.error('Error during shutdown:', String(err)));
    });

    this.api.on('didFinishLaunching', () => {
      loadModel()
        .then(() => this.log.info('YOLO model loaded'))
        .catch(err => { this.log.error('Failed to load YOLO model:', String(err)); throw err; })
        .then(() => this.discoverDevices())
        .catch(err => this.log.error('Failed to initialize accessories:', String(err)));
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private discoverDevices(): void {
    const streams: StreamConfig[] = this.config.streams ?? [];
    const seenUUIDs = new Set<string>();

    for (const stream of streams) {
      const sensorAccessories: StreamSensorAccessory[] = [];

      // Validate and filter each sensor group, warning on unknown category strings.
      const validSensors: Category[][] = [];
      for (const rawGroup of stream.sensors) {
        const labels = (rawGroup as string[]).filter(label => {
          if (isCategory(label)) return true;
          this.log.warn(`Unknown category "${label}" in stream ${stream.url} — valid values: ${VALID_CATEGORIES}`);
          return false;
        }).sort() as Category[];

        if (labels.length === 0) {
          this.log.warn(`Sensor group has no valid categories in stream ${stream.url}, skipping`);
        } else {
          validSensors.push(labels);
        }
      }

      if (!stream.name) {
        this.log.warn(`Stream ${stream.url} is missing a "name" — add one to your config`);
      }

      for (const labels of validSensors) {
        const uuid = this.api.hap.uuid.generate(`${stream.url}:${labels.join(',')}`);
        seenUUIDs.add(uuid);

        const name = stream.name
          ? `${stream.name} ${sensorName(labels)}`
          : sensorName(labels);

        const existing = this.accessories.find(a => a.UUID === uuid);
        let pa: PlatformAccessory;

        if (existing) {
          this.log.info('Restoring accessory:', name);
          pa = existing;
        } else {
          this.log.info('Adding accessory:', name);
          pa = new this.api.platformAccessory(name, uuid);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [pa]);
        }

        sensorAccessories.push(new StreamSensorAccessory(this, pa, name));
      }

      const worker = new StreamWorker(
        { ...stream, sensors: validSensors },
        (i, active) => sensorAccessories[i]?.setMotion(active),
        frame => runInference(frame),
        this.log,
      );
      worker.start();
      this.workers.push(worker);
    }

    const stale = this.accessories.filter(a => !seenUUIDs.has(a.UUID));
    if (stale.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.log.info('Removing stale accessories:', stale.map(a => a.displayName).join(', '));
    }
  }
}
