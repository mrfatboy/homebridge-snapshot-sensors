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
import { StreamConfig } from './types.js';

export class StreamSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  discoverDevices() {
    const streams: StreamConfig[] = this.config.streams ?? [];

    for (const stream of streams) {
      const uuid = this.api.hap.uuid.generate(stream.id);
      const existingAccessory = this.accessories.find(a => a.UUID === uuid);

      if (existingAccessory) {
        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
        new StreamSensorAccessory(this, existingAccessory, stream);
      } else {
        this.log.info('Adding new accessory:', stream.name);
        const accessory = new this.api.platformAccessory(stream.name, uuid);
        accessory.context.stream = stream;
        new StreamSensorAccessory(this, accessory, stream);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    const activeUUIDs = streams.map(s => this.api.hap.uuid.generate(s.id));
    const staleAccessories = this.accessories.filter(a => !activeUUIDs.includes(a.UUID));
    if (staleAccessories.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
      this.log.info('Removing stale accessories:', staleAccessories.map(a => a.displayName).join(', '));
    }
  }
}
