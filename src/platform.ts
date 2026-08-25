import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { resolveSensors } from './categories.js';
import { matchingSensors } from './detector.js';
import { runYolo } from './yolo.js';
import type { Detection, SensorSpec, SnapshotConfig, NotificationChannel, Category, StoreSnapshots } from './types.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, chown } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024;
type NotificationCategory = Category | 'unidentified';
type SnapshotRuntime = { config: SnapshotConfig; sensors: SensorSpec[]; service: Service; running: boolean };
const detectionMessages: Record<NotificationCategory, string> = {
  people: 'Person detected', animals: 'Animal detected', vehicles: 'Vehicle detected', unidentified: 'Unidentified Activity detected',
};

export class SnapshotSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly runtimes = new Map<string, SnapshotRuntime>();
  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service; this.Characteristic = api.hap.Characteristic;
    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }
  configureAccessory(accessory: PlatformAccessory): void { this.accessories.push(accessory); }
  private discoverDevices(): void {
    const snapshots: SnapshotConfig[] = this.config.snapshots ?? [];
    if (snapshots.length === 0) { this.log.info('No snapshots configured.'); return; }
    for (const snapshot of snapshots) {
      const snapshotName = typeof snapshot.name === 'string' ? snapshot.name.trim() : '';
      if (!snapshotName) { this.log.error('Snapshot is missing a required name — skipping it'); continue; }
      const sensors: SensorSpec[] = resolveSensors(snapshotName, snapshot.sensors ?? [], (msg) => this.log.warn(msg));
      if (sensors.length === 0) { this.log.warn(`Snapshot "${snapshotName}" has no configured sensors — skipping it`); continue; }
      const uuid = this.api.hap.uuid.generate(`${this.config.name || 'SnapshotSensors'}:${snapshotName}`);
      let accessory = this.accessories.find(candidate => candidate.UUID === uuid);
      if (!accessory) { accessory = new this.api.platformAccessory(snapshotName, uuid); this.api.registerPlatformAccessories('SnapshotSensors', 'SnapshotSensors', [accessory]); this.accessories.push(accessory); }
      const service = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch, snapshotName, 'snapshot-trigger');
      service.setCharacteristic(this.Characteristic.Name, snapshotName);
      service.getCharacteristic(this.Characteristic.On).onSet(async (value) => { if (value !== true) return; setTimeout(() => service.updateCharacteristic(this.Characteristic.On, false), 1000); void this.triggerSnapshot(snapshotName); });
      this.runtimes.set(snapshotName, { config: snapshot, sensors, service, running: false });
      this.log.info(`Configured snapshot "${snapshotName}" with ${sensors.length} sensor definition(s).`);
    }
  }
  private async triggerSnapshot(snapshotName: string): Promise<void> {
    const runtime = this.runtimes.get(snapshotName);
    if (!runtime) return;
    if (runtime.running) {
      this.log.info(`[${snapshotName}] Snapshot already running; skipping duplicate trigger.`);
      return;
    }
    const startedAt = process.hrtime.bigint(); runtime.running = true;
    let providerUsed = 'none'; let detectionType = detectionMessages.unidentified;
    const store = (runtime.config.storeSnapshots ?? 'never') as StoreSnapshots;
    try {
      const response = await fetch(runtime.config.url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Camera returned HTTP ${response.status}`);
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = Number(contentLength);
        if (!Number.isFinite(size) || size < 0) throw new Error('Camera returned an invalid Content-Length header');
        if (size > MAX_SNAPSHOT_SIZE) throw new Error('Camera snapshot exceeds the maximum allowed size of 10 MB');
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg'; const image = Buffer.from(await response.arrayBuffer());
      if (!image.length) throw new Error('Camera returned an empty response');
      if (image.length > MAX_SNAPSHOT_SIZE) throw new Error('Camera snapshot exceeds the maximum allowed size of 10 MB');
      const yolo = await runYolo(image, store);
      if (!yolo) {
        this.log.info(`[${snapshotName}] YOLO is busy; skipping snapshot detection.`);
        return;
      }
      await this.saveSnapshot(runtime.config, image, yolo.annotatedImage, contentType);
      const matched = matchingSensors(yolo.detections, runtime.sensors);
      if (matched.length === 0) {
        const used = await this.sendNotification(runtime.config, 'unidentified');
        if (used) providerUsed = used;
      } else {
        let bestMatch: { category: Category; score: number } | null = null;
        for (const sensor of matched) {
          for (const detection of yolo.detections) {
            const category = this.categoryForDetection(detection);
            if (!category || !sensor.categories.includes(category)) continue;
            if (detection.score < (sensor.thresholds[category] ?? 0.25)) continue;
            if (!bestMatch || detection.score > bestMatch.score) bestMatch = { category, score: detection.score };
          }
        }
        if (bestMatch) {
          detectionType = detectionMessages[bestMatch.category];
          const used = await this.sendNotification(runtime.config, bestMatch.category);
          if (used) providerUsed = used;
        }
      }
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.log.info(`[${snapshotName}] ${detectionType}; notification provider: ${providerUsed}; image saved: ${store}; total elapsed time: ${this.formatElapsed(elapsedMs)}.`);
    } catch (error) {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.log.error(`[${snapshotName}] Snapshot detection failed after ${this.formatElapsed(elapsedMs)} — ${detectionType}; notification provider: ${providerUsed}; image saved: ${store}; error: ${error instanceof Error ? error.message : String(error)}`);
    } finally { runtime.running = false; runtime.service.updateCharacteristic(this.Characteristic.On, false); }
  }
  private formatElapsed(ms: number): string { return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`; }
  private categoryForDetection(detection: Detection): Category | null {
    if (detection.className === 'person') return 'people';
    if (['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe'].includes(detection.className)) return 'animals';
    if (['bicycle', 'car', 'motorcycle', 'bus', 'train', 'truck', 'boat'].includes(detection.className)) return 'vehicles';
    return null;
  }
  private async saveSnapshot(config: SnapshotConfig, image: Buffer, annotated: Buffer | undefined, contentType: string): Promise<void> {
    const store = config.storeSnapshots ?? 'never'; if (store === 'never') return;
    const directory = config.snapshotDirectory?.trim(); if (!directory) throw new Error('Snapshot Directory is required when storing snapshots.');
    await mkdir(directory, { recursive: true }); const prefix = (config.snapshotPrefix?.trim() || config.name).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, '_');
    const now = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${randomUUID().slice(0, 8)}${store === 'annotated' ? '.jpg' : (contentType.toLowerCase().includes('png') ? '.png' : '.jpg')}`;
    const filePath = path.join(directory, filename); await writeFile(filePath, store === 'annotated' && annotated ? annotated : image); await this.applyOwnership(filePath, config.snapshotOwnership);
  }
  private async applyOwnership(filePath: string, ownership?: string): Promise<void> {
    if (!ownership?.trim()) return; const [username, group] = ownership.split(':', 2).map(part => part.trim()); if (!username) throw new Error('Snapshot Ownership Override must contain a username.');
    const { stdout: passwd } = await execFileAsync('getent', ['passwd', username]); const fields = passwd.trim().split(':'); if (fields.length < 4) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    const uid = Number(fields[2]); let gid = Number(fields[3]); if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    if (group) { const { stdout: groupData } = await execFileAsync('getent', ['group', group]); const groupFields = groupData.trim().split(':'); if (groupFields.length < 3) throw new Error(`Unable to resolve snapshot group: ${group}`); gid = Number(groupFields[2]); if (!Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot group: ${group}`); }
    await chown(filePath, uid, gid);
  }
  private async sendNotification(config: SnapshotConfig, category: NotificationCategory): Promise<string | null> {
    const notification = config.notifications; const provider = notification?.provider ?? 'none'; if (provider === 'none') return null;
    const channel: NotificationChannel | undefined = provider === 'pushover' ? notification?.pushover : provider === 'pushbullet' ? notification?.pushbullet : provider === 'ntfy' ? notification?.ntfy : notification?.pushsafer;
    if (!channel) return null;
    const key = category === 'unidentified' ? 'unidentifiedMessage' : `${category.slice(0, -1)}Message`; const message = channel[key as keyof NotificationChannel] as string | undefined; if (!message) return null;
    const title = channel.title?.trim() || 'Snapshot Sensors';
    if (provider === 'pushover') {
      if (!channel.token || !channel.user) throw new Error('Pushover token and user are required.');
      const form = new URLSearchParams({ token: channel.token, user: channel.user, message, title, sound: channel.sound?.trim() || 'pushover' }); if (channel.device?.trim()) form.set('device', channel.device.trim());
      const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`Pushover returned HTTP ${response.status}`); return 'Pushover';
    }
    if (provider === 'pushbullet') {
      if (!channel.apiKey) throw new Error('Pushbullet Access Token is required.');
      const push: Record<string, string> = { type: 'note', title, body: message }; if (channel.deviceIden) push.device_iden = channel.deviceIden; else if (channel.email) push.email = channel.email; else if (channel.channelTag) push.channel_tag = channel.channelTag;
      const response = await fetch('https://api.pushbullet.com/v2/pushes', { method: 'POST', headers: { 'Access-Token': channel.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(push), signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`Pushbullet returned HTTP ${response.status}`); return 'Pushbullet';
    }
    if (provider === 'ntfy') {
      const server = (channel.server?.trim() || 'https://ntfy.sh').replace(/\/+$/, ''); const topic = channel.topic?.trim(); if (!topic) throw new Error('ntfy Topic is required.');
      const url = `${server}/${encodeURIComponent(topic)}`; const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8', 'Title': title, 'Priority': String(channel.priority ?? 3) };
      if (channel.tags?.trim()) headers.Tags = channel.tags.trim(); if (channel.accessToken?.trim()) headers.Authorization = `Bearer ${channel.accessToken.trim()}`;
      const response = await fetch(url, { method: 'POST', headers, body: message, signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`); return 'ntfy';
    }
    if (!channel.privateKey?.trim()) throw new Error('Push Safer Private Key is required.');
    const form = new URLSearchParams({ k: channel.privateKey.trim(), t: title, m: message, d: channel.pushsaferDevice?.trim() || '', i: String(channel.icon ?? 1), v: String(channel.vibration ?? 1), p: String(channel.priority ?? 0) });
    if (channel.sound?.trim()) form.set('s', channel.sound.trim());
    if (channel.iconColor?.trim()) form.set('c', channel.iconColor.trim());
    if (channel.url?.trim()) form.set('u', channel.url.trim());
    if (channel.urlTitle?.trim()) form.set('ut', channel.urlTitle.trim());
    if (channel.timeToLive !== undefined) form.set('l', String(channel.timeToLive));
    if (channel.retry !== undefined) form.set('re', String(channel.retry));
    if (channel.expire !== undefined) form.set('ex', String(channel.expire));
    const response = await fetch('https://www.pushsafer.com/api', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Push Safer returned HTTP ${response.status}`);
    return 'Push Safer';
  }
}
