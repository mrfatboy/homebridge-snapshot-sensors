import type { PlatformAccessory, CharacteristicValue } from 'homebridge';
import type { StreamSensorsPlatform } from './platform.js';
import type { StreamHealth } from './types.js';

export class StreamSensorAccessory {
  private readonly motionService;
  private active = false;

  constructor(
    private readonly platform: StreamSensorsPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly name: string,
    private readonly logStatus: boolean,
  ) {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'homebridge-stream-sensors')
      .setCharacteristic(this.platform.Characteristic.Model, 'Stream Sensor')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.UUID);

    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);

    this.motionService.setCharacteristic(this.platform.Characteristic.Name, name);

    this.motionService
      .getCharacteristic(this.platform.Characteristic.MotionDetected)
      .onGet(this.getMotionDetected.bind(this));

    // Surface the underlying stream's liveness so a dead camera/URL is visible in
    // the Home app (StatusActive=false) and faultable in automations
    // (StatusFault). Starts in the "connecting" state until the first frame.
    this.motionService
      .setCharacteristic(this.platform.Characteristic.StatusActive, false)
      .setCharacteristic(
        this.platform.Characteristic.StatusFault,
        this.platform.Characteristic.StatusFault.NO_FAULT,
      );
  }

  // Reflect stream health onto the optional MotionSensor status characteristics.
  // Called for every sensor sharing a stream whenever the pump's liveness changes.
  setHealth(health: StreamHealth): void {
    const C = this.platform.Characteristic;
    this.motionService.updateCharacteristic(C.StatusActive, health === 'online');
    this.motionService.updateCharacteristic(
      C.StatusFault,
      health === 'down' ? C.StatusFault.GENERAL_FAULT : C.StatusFault.NO_FAULT,
    );
  }

  setMotion(active: boolean): void {
    // Called every sample with the current level; only notify HomeKit on change.
    if (active === this.active) return;
    this.active = active;
    // Status logging is opt-in per sensor (off by default) to keep the log
    // quiet; when muted the change still goes out at debug level for
    // troubleshooting.
    const msg = `${this.name}: ${active ? 'detected' : 'idle'}`;
    if (this.logStatus) {
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
