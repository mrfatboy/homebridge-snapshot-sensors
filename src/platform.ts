import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { StreamSensorAccessory } from './accessory.js';
import { StreamWorker } from './stream.js';
import { loadModel, closeModel } from './inference.js';
import { resolveSensors } from './categories.js';
import type { StreamConfig, SensorSpec, StoreSnapshots } from './types.js';

export class SnapshotSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly workers: StreamWorker[] = [];

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.api.on('shutdown', async () => {
      const draining = this.workers.map((worker) => { worker.stop(); return worker.waitForStop(); });
      this.workers.length = 0;
      await Promise.all(draining).catch((err) => this.log.error('Error stopping workers:', String(err)));
      await closeModel().catch((err) => this.log.error('Error releasing YOLO model:', String(err)));
    });

    this.api.on('didFinishLaunching', () => {
      const streams: StreamConfig[] = this.config.streams ?? [];
      if (streams.length === 0) {
        this.log.info('No snapshot sensors configured — nothing to detect.');
        this.discoverDevices();
        return;
      }
      loadModel()
        .then(() => this.log.info('YOLO model loaded'))
        .then(() => this.discoverDevices())
        .catch((err) => this.log.error('Failed to initialize snapshot sensors:', String(err)));
    });
  }

  configureAccessory(accessory: PlatformAccessory): void { this.accessories.push(accessory); }

  private discoverDevices(): void {
    const streams: StreamConfig[] = this.config.streams ?? [];
    const seenUUIDs = new Set<string>();
    const claimedNames = new Set<string>();

    for (const stream of streams) {
      const streamName = typeof stream.name === 'string' ? stream.name.trim() : '';
      if (!streamName) { this.log.error('Snapshot sensor is missing a required name — skipping it'); continue; }

      const resolved = resolveSensors(streamName, stream.sensors ?? [], (msg) => this.log.warn(msg));
      const sensors: SensorSpec[] = [];
      for (const sensor of resolved) {
        if (claimedNames.has(sensor.name)) { this.log.error(`Duplicate sensor name "${sensor.name}" — skipping duplicate`); continue; }
        claimedNames.add(sensor.name);
        sensors.push(sensor);
      }
      if (sensors.length === 0) { this.log.warn(`Snapshot sensor "${streamName}" has no configured sensors — not starting it`); continue; }

      const sensorAccessories: StreamSensorAccessory[] = sensors.map((sensor) => {
        const uuid = this.api.hap.uuid.generate(sensor.name);
        seenUUIDs.add(uuid);
        const existing = this.accessories.find((a) => a.UUID === uuid);
        const pa = existing ?? new this.api.platformAccessory(sensor.name, uuid);
        if (existing) this.log.info('Restoring accessory:', sensor.name);
        else { this.log.info('Adding accessory:', sensor.name); this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [pa]); }
        return new StreamSensorAccessory(this, pa, sensor.name, sensor.logStatus);
      });

      const storeSnapshots: StoreSnapshots = stream.storeSnapshots === 'annotated' ? 'annotated' : stream.storeSnapshots === 'normal' ? 'normal' : 'never';
      const worker = new StreamWorker(
        stream.url,
        streamName,
        sensors,
        storeSnapshots,
        stream.snapshotDirectory ?? '',
        stream.snapshotPrefix ?? streamName,
        (i, active) => sensorAccessories[i]?.setMotion(active),
        (health) => sensorAccessories.forEach((accessory) => accessory.setHealth(health)),
        this.log,
      );
      worker.start();
      this.workers.push(worker);
    }

    const stale = this.accessories.filter((accessory) => !seenUUIDs.has(accessory.UUID));
    if (stale.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.log.info('Removing stale accessories:', stale.map((a) => a.displayName).join(', '));
    }
  }
}
