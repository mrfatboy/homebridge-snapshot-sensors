import { PlatformAccessory, CharacteristicValue } from 'homebridge';
import { StreamSensorsPlatform } from './platform.js';
import { StreamConfig, StreamStatus } from './types.js';

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export class StreamSensorAccessory {
  private readonly motionService;
  private currentStatus: StreamStatus = { online: false };

  constructor(
    private readonly platform: StreamSensorsPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly config: StreamConfig,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'homebridge-stream-sensors')
      .setCharacteristic(this.platform.Characteristic.Model, 'Stream Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, config.id);

    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);

    this.motionService.setCharacteristic(this.platform.Characteristic.Name, config.name);

    this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.getMotionDetected.bind(this));

    this.startPolling();
  }

  private getMotionDetected(): CharacteristicValue {
    return this.currentStatus.online;
  }

  private startPolling() {
    const interval = (this.config.pollInterval ?? DEFAULT_POLL_INTERVAL_MS / 1000) * 1000;
    this.poll();
    setInterval(() => this.poll(), interval);
  }

  private async poll() {
    try {
      const status = await this.fetchStreamStatus();
      const changed = status.online !== this.currentStatus.online;
      this.currentStatus = status;

      if (changed) {
        this.motionService.updateCharacteristic(
          this.platform.Characteristic.MotionDetected,
          status.online,
        );
        this.platform.log.info(`[${this.config.name}] Stream is now ${status.online ? 'online' : 'offline'}`);
      }
    } catch (err) {
      this.platform.log.error(`[${this.config.name}] Poll failed:`, err);
    }
  }

  // Override in subclasses or replace with real implementation.
  protected async fetchStreamStatus(): Promise<StreamStatus> {
    return { online: false };
  }
}
