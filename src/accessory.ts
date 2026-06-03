import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { StreamSensorsPlatform } from './platform.js';

export class StreamSensorAccessory {
  private readonly motionService;
  private active = false;

  constructor(
    private readonly platform: StreamSensorsPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly name: string,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'homebridge-stream-sensors')
      .setCharacteristic(this.platform.Characteristic.Model, 'Stream Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.UUID);

    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);

    this.motionService.setCharacteristic(this.platform.Characteristic.Name, name);

    this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.getMotionDetected.bind(this));
  }

  setMotion(active: boolean): void {
    // Called every sample with the current level; only notify HomeKit on change.
    if (active === this.active) return;
    this.active = active;
    // Status logging is opt-in (off by default) to keep the log quiet; when
    // muted the change still goes out at debug level for troubleshooting.
    const msg = `${this.name}: ${active ? 'detected' : 'idle'}`;
    if (this.platform.config.logSensorStatus === true) {
      this.platform.log.info(msg);
    } else {
      this.platform.log.debug(msg);
    }
    this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, active);
  }

  private getMotionDetected(): CharacteristicValue {
    return this.active;
  }
}
