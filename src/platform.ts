import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { resolveSensors, categoryOfClass } from './categories.js';
import { matchingSensors } from './detector.js';
import { runYolo } from './yolo.js';
import type { Detection, SensorSpec, SnapshotConfig, NotificationChannel } from './types.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, chown } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { PLUGIN_NAME, PLATFORM_NAME } from './settings.js';

const execFileAsync = promisify(execFile);

type SnapshotRuntime = {
  config: SnapshotConfig;
  sensors: SensorSpec[];
  service: Service;
  running: boolean;
};

type NotificationCategory = 'animals' | 'people' | 'vehicles' | 'packages' | 'unidentified';

export class SnapshotSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly runtimes = new Map<string, SnapshotRuntime>();

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

      const uuid = this.api.hap.uuid.generate(`${this.config.name || PLATFORM_NAME}:${snapshotName}`);
      let accessory = this.accessories.find(candidate => candidate.UUID === uuid);
      if (!accessory) {
        accessory = new this.api.platformAccessory(snapshotName, uuid);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.push(accessory);
      }

      const service = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch, snapshotName, 'snapshot-trigger');
      service.setCharacteristic(this.Characteristic.Name, snapshotName);
      service.getCharacteristic(this.Characteristic.On).onSet(async (value: boolean) => {
        if (!value) return;
        await this.triggerSnapshot(snapshotName);
      });

      this.runtimes.set(snapshotName, { config: snapshot, sensors, service, running: false });
      this.log.info(`Configured snapshot "${snapshotName}" with ${sensors.length} sensor definition(s).`);
    }
  }

  private async triggerSnapshot(snapshotName: string): Promise<void> {
    const runtime = this.runtimes.get(snapshotName);
    if (!runtime || runtime.running) return;
    runtime.running = true;
    try {
      const response = await fetch(runtime.config.url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Camera returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const image = Buffer.from(await response.arrayBuffer());
      if (!image.length) throw new Error('Camera returned an empty response');

      const store = runtime.config.storeSnapshots ?? 'never';
      const yolo = await runYolo(image, store);
      await this.saveSnapshot(runtime.config, image, yolo.annotatedImage, contentType);

      const matched = matchingSensors(yolo.detections, runtime.sensors);
      if (matched.length === 0) {
        this.log.info(`[${snapshotName}] No configured sensor matched the YOLO detections; sending Unidentified Activity.`);
        await this.sendNotification(runtime.config, 'unidentified');
      } else {
        for (const sensor of matched) {
          const categories = this.matchedCategories(yolo.detections, sensor);
          if (sensor.logStatus) this.log.info(`[${snapshotName}] ${sensor.name}: matched ${categories.join(', ') || 'configured category'}`);
          for (const category of categories) await this.sendNotification(runtime.config, category);
        }
      }
    } catch (error) {
      this.log.error(`[${snapshotName}] Snapshot detection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      runtime.running = false;
      runtime.service.updateCharacteristic(this.Characteristic.On, false);
    }
  }

  private matchedCategories(detections: Detection[], sensor: SensorSpec): NotificationCategory[] {
    const categories = new Set<NotificationCategory>();
    for (const detection of detections) {
      if (detection.score < sensor.threshold) continue;
      const category = categoryOfClass(detection.classId);
      if (category && sensor.categories.includes(category)) categories.add(category);
    }
    return [...categories];
  }

  private async saveSnapshot(config: SnapshotConfig, image: Buffer, annotated: Buffer | undefined, contentType: string): Promise<void> {
    const store = config.storeSnapshots ?? 'never';
    if (store === 'never') return;
    const directory = config.snapshotDirectory?.trim();
    if (!directory) throw new Error('Snapshot Directory is required when storing snapshots.');
    await mkdir(directory, { recursive: true });
    const prefix = (config.snapshotPrefix?.trim() || config.name).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, '_');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${randomUUID().slice(0, 8)}${store === 'annotated' ? '.jpg' : (contentType.toLowerCase().includes('png') ? '.png' : '.jpg')}`;
    const filePath = path.join(directory, filename);
    await writeFile(filePath, store === 'annotated' && annotated ? annotated : image);
    await this.applyOwnership(filePath, config.snapshotOwnership);
  }

  private async applyOwnership(filePath: string, ownership?: string): Promise<void> {
    if (!ownership?.trim()) return;
    const [username, group] = ownership.split(':', 2).map(part => part.trim());
    if (!username) throw new Error('Snapshot Ownership Override must contain a username.');
    const { stdout: passwd } = await execFileAsync('getent', ['passwd', username]);
    const fields = passwd.trim().split(':');
    if (fields.length < 4) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    const uid = Number(fields[2]);
    let gid = Number(fields[3]);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    if (group) {
      const { stdout: groupData } = await execFileAsync('getent', ['group', group]);
      const groupFields = groupData.trim().split(':');
      if (groupFields.length < 3) throw new Error(`Unable to resolve snapshot group: ${group}`);
      gid = Number(groupFields[2]);
      if (!Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot group: ${group}`);
    }
    await chown(filePath, uid, gid);
  }

  private async sendNotification(config: SnapshotConfig, category: NotificationCategory): Promise<void> {
    const notification = config.notifications;
    const provider = notification?.provider ?? 'none';
    if (provider === 'none') return;
    const channel: NotificationChannel | undefined = provider === 'pushover' ? notification?.pushover : notification?.pushbullet;
    if (!channel) return;

    const messageKey: Record<NotificationCategory, keyof NotificationChannel> = {
      animals: 'animalMessage',
      people: 'personMessage',
      vehicles: 'vehicleMessage',
      packages: 'unidentifiedMessage',
      unidentified: 'unidentifiedMessage',
    };
    const message = channel[messageKey[category]]?.trim();
    if (!message) return;
    const title = channel.title?.trim() || 'Snapshot Sensors';

    if (provider === 'pushover') {
      if (!channel.token || !channel.user) throw new Error('Pushover token and user are required.');
      const form = new URLSearchParams({ token: channel.token, user: channel.user, message, title, sound: channel.sound?.trim() || 'pushover' });
      if (channel.device?.trim()) form.set('device', channel.device.trim());
      const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Pushover returned HTTP ${response.status}`);
      return;
    }

    if (!channel.apiKey) throw new Error('Pushbullet Access Token is required.');
    const push: Record<string, string> = { type: 'note', title, body: message };
    if (channel.deviceIden) push.device_iden = channel.deviceIden;
    else if (channel.email) push.email = channel.email;
    else if (channel.channelTag) push.channel_tag = channel.channelTag;
    const response = await fetch('https://api.pushbullet.com/v2/pushes', { method: 'POST', headers: { 'Access-Token': channel.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(push), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Pushbullet returned HTTP ${response.status}`);
  }
}
