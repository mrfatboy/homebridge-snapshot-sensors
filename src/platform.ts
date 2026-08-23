import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { resolveSensors } from './categories.js';
import type { SensorSpec, SnapshotConfig } from './types.js';

export class SnapshotSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  private discoverDevices(): void {
    const snapshots: SnapshotConfig[] = this.config.snapshots ?? [];
    if (snapshots.length === 0) {
      this.log.info('No snapshots configured.');
      return;
    }

    for (const snapshot of snapshots) {
      const snapshotName = typeof snapshot.name === 'string' ? snapshot.name.trim() : '';
      if (!snapshotName) {
        this.log.error('Snapshot is missing a required name — skipping it');
        continue;
      }

      const sensors: SensorSpec[] = resolveSensors(snapshotName, snapshot.sensors ?? [], (msg) => this.log.warn(msg));
      if (sensors.length === 0) {
        this.log.warn(`Snapshot "${snapshotName}" has no configured sensors — skipping it`);
        continue;
      }

      this.log.info(`Configured snapshot "${snapshotName}" with ${sensors.length} sensor definition(s).`);
    }
  }
}
