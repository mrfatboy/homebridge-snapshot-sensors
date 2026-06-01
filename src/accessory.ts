import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { StreamSensorsPlatform } from './platform.js';

export class StreamSensorAccessory {
  private readonly motionService;
  private active = false;

  constructor(
    private readonly platform: StreamSensorsPlatform,
    private readonly accessory: PlatformAccessory,
    name: string,
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
    this.active = active;
    this.motionService.updateCharacteristic(this.platform.Characteristic.MotionDetected, active);
  }

  private getMotionDetected(): CharacteristicValue {
    return this.active;
  }
}
