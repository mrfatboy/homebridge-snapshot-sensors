import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { resolveSensors } from './categories.js';
import { matchingSensors } from './detector.js';
import { runYolo } from './yolo.js';
import type { SensorSpec, SnapshotConfig, NotificationChannel, Category, StoreSnapshots, Detection } from './types.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, chown } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const MAX_SNAPSHOT_SIZE = 10 * 1024 * 1024;
const TEST_IMAGE_PATH = process.env.SNAPSHOT_SENSORS_TEST_IMAGE?.trim();
type NotificationCategory = Category | 'unidentified';
type SnapshotRuntime = { config: SnapshotConfig; sensors: SensorSpec[]; service: Service; running: boolean };
type OwnershipIds = { uid: number; gid: number };
const detectionMessages: Record<NotificationCategory, string> = {
  people: 'Person detected', animals: 'Animal detected', vehicles: 'Vehicle detected', unidentified: 'Unidentified Activity detected',
};
type WebhookPayload = { camera: string; object: string; confidence: number | null };
type BestDetection = Pick<Detection, 'category' | 'score' | 'className'>;

export class SnapshotSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly runtimes = new Map<string, SnapshotRuntime>();
  private readonly ownershipCache = new Map<string, Promise<OwnershipIds>>();
  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service; this.Characteristic = api.hap.Characteristic;
    this.api.on('didFinishLaunching', () => this.discoverDevices());
  }
  configureAccessory(accessory: PlatformAccessory): void { this.accessories.push(accessory); }
  private discoverDevices(): void {
    const snapshots: SnapshotConfig[] = this.config.snapshots ?? [];
    if (snapshots.length === 0) { this.log.info('No snapshots configured.'); return; }
    if (TEST_IMAGE_PATH) this.log.warn(`[Test Image] Development test image enabled: ${TEST_IMAGE_PATH}`);
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
    if (runtime.running) { this.log.info(`[${snapshotName}] Snapshot already running; skipping duplicate trigger.`); return; }
    const startedAt = process.hrtime.bigint(); runtime.running = true;
    let providerUsed = 'none'; let detectionType = 'No objects matching the selected categories were detected';
    const store = (runtime.config.storeSnapshots ?? 'never') as StoreSnapshots;
    try {
      let image: Buffer;
      let contentType = 'image/jpeg';
      if (TEST_IMAGE_PATH) {
        image = await readFile(TEST_IMAGE_PATH);
        if (!image.length) throw new Error(`Test image is empty: ${TEST_IMAGE_PATH}`);
        this.log.info(`[${snapshotName}] [Test Image] Using ${TEST_IMAGE_PATH}`);
      } else {
        const response = await fetch(runtime.config.url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Camera returned HTTP ${response.status}`);
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const size = Number(contentLength);
          if (!Number.isFinite(size) || size < 0) throw new Error('Camera returned an invalid Content-Length header');
          if (size > MAX_SNAPSHOT_SIZE) throw new Error('Camera snapshot exceeds the maximum allowed size of 10 MB');
        }
        contentType = response.headers.get('content-type') || 'image/jpeg'; image = Buffer.from(await response.arrayBuffer());
        if (!image.length) throw new Error('Camera returned an empty response');
      }
      if (image.length > MAX_SNAPSHOT_SIZE) throw new Error('Snapshot image exceeds the maximum allowed size of 10 MB');
      const yolo = await runYolo(image, store);
      if (!yolo) { this.log.info(`[${snapshotName}] YOLO is busy; skipping snapshot detection.`); return; }
      if (TEST_IMAGE_PATH) {
        const details = yolo.detections
          .filter(d => d.category !== null && runtime.sensors.some(sensor =>
            sensor.categories.includes(d.category!) &&
            sensor.thresholds[d.category!] !== undefined &&
            d.score >= sensor.thresholds[d.category!]!,
          ))
          .map(d => `${d.className} (${d.score.toFixed(3)})`);
        this.log.info(`[${snapshotName}] [Test Image] Accepted detections: ${details.length === 0 ? 'none' : details.join(', ')}`);
      }
      const matched = matchingSensors(yolo.detections, runtime.sensors);
      let annotatedImage: Buffer | undefined;
      if (store === 'annotated' && matched.length > 0 && yolo.createAnnotatedImage) {
        annotatedImage = await yolo.createAnnotatedImage(runtime.sensors);
      }
      await this.saveSnapshot(runtime.config, image, annotatedImage, contentType);
      let webhookPayload: WebhookPayload | null = null;
      if (matched.length === 0) {
        const unidentifiedMotionActivityEnabled = runtime.sensors.some(sensor => sensor.unidentifiedMotionActivity);
        if (yolo.detections.length > 0 && unidentifiedMotionActivityEnabled) {
          detectionType = detectionMessages.unidentified;
          const used = await this.sendNotification(runtime.config, 'unidentified');
          if (used) providerUsed = used;
          webhookPayload = { camera: snapshotName, object: 'unidentified', confidence: null };
        }
      } else {
        let bestMatch: BestDetection | null = null;
        for (const sensor of matched) {
          for (const detection of yolo.detections) {
            const category = detection.category;
            if (!category || !sensor.categories.includes(category)) continue;
            if (detection.score < (sensor.thresholds[category] ?? 0.25)) continue;
            if (!bestMatch || detection.score > bestMatch.score) bestMatch = { category, score: detection.score, className: detection.className };
          }
        }
        if (bestMatch) {
          detectionType = detectionMessages[bestMatch.category];
          const used = await this.sendNotification(runtime.config, bestMatch.category);
          if (used) providerUsed = used;
          webhookPayload = { camera: snapshotName, object: bestMatch.className, confidence: bestMatch.score };
        }
      }
      if (webhookPayload) void this.sendWebhook(runtime.config, webhookPayload);
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.log.info(`[${snapshotName}] ${TEST_IMAGE_PATH ? '[Test Image] ' : ''}${detectionType}; notification provider: ${providerUsed}; image saved: ${store}; total elapsed time: ${this.formatElapsed(elapsedMs)}.`);
    } catch (error) {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.log.error(`[${snapshotName}] Snapshot detection failed after ${this.formatElapsed(elapsedMs)} — ${TEST_IMAGE_PATH ? '[Test Image] ' : ''}${detectionType}; notification provider: ${providerUsed}; image saved: ${store}; error: ${error instanceof Error ? error.message : String(error)}`);
    } finally { runtime.running = false; runtime.service.updateCharacteristic(this.Characteristic.On, false); }
  }
  private async sendWebhook(config: SnapshotConfig, payload: WebhookPayload): Promise<void> {
    const webhook = config.webhook;
    if (!webhook?.enabled || !webhook.url?.trim()) return;
    try {
      const parsed = new URL(webhook.url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Webhook URL must use HTTP or HTTPS');
      const method = webhook.method === 'GET' ? 'GET' : 'POST';
      let url = parsed;
      const options: RequestInit = { method, signal: AbortSignal.timeout(15000) };
      if (method === 'POST') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(payload);
      } else {
        url = new URL(parsed.toString());
        url.searchParams.set('camera', payload.camera);
        url.searchParams.set('object', payload.object);
        url.searchParams.set('confidence', payload.confidence === null ? 'null' : String(payload.confidence));
      }
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.log.info(`[${config.name}] Webhook sent: HTTP ${response.status} — ${response.statusText || 'OK'}`);
    } catch (error) {
      this.log.warn(`[${config.name}] Webhook failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  private formatElapsed(ms: number): string { return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`; }
  private async saveSnapshot(config: SnapshotConfig, image: Buffer, annotated: Buffer | undefined, contentType: string): Promise<void> {
    const store = config.storeSnapshots ?? 'never'; if (store === 'never') return;
    const directory = config.snapshotDirectory?.trim(); if (!directory) throw new Error('Snapshot Directory is required when storing snapshots.');
    await mkdir(directory, { recursive: true }); const prefix = (config.snapshotPrefix?.trim() || config.name).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, '_');
    const now = new Date(); const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${randomUUID().slice(0, 8)}${store === 'annotated' ? '.jpg' : (contentType.toLowerCase().includes('png') ? '.png' : '.jpg')}`;
    const filePath = path.join(directory, filename); await writeFile(filePath, store === 'annotated' && annotated ? annotated : image); await this.applyOwnership(filePath, config.snapshotOwnership);
  }
  private async applyOwnership(filePath: string, ownership?: string): Promise<void> {
    if (!ownership?.trim()) return;
    const key = ownership.trim();
    let idsPromise = this.ownershipCache.get(key);
    if (!idsPromise) {
      idsPromise = this.resolveOwnership(key);
      this.ownershipCache.set(key, idsPromise);
    }
    try {
      const { uid, gid } = await idsPromise;
      await chown(filePath, uid, gid);
    } catch (error) {
      if (this.ownershipCache.get(key) === idsPromise) this.ownershipCache.delete(key);
      throw error;
    }
  }
  private async resolveOwnership(ownership: string): Promise<OwnershipIds> {
    const [username, group] = ownership.split(':', 2).map(part => part.trim());
    if (!username) throw new Error('Snapshot Ownership Override must contain a username.');
    const { stdout: passwd } = await execFileAsync('getent', ['passwd', username]);
    const fields = passwd.trim().split(':');
    if (fields.length < 4) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    const uid = Number(fields[2]); let gid = Number(fields[3]);
    if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    if (group) {
      const { stdout: groupData } = await execFileAsync('getent', ['group', group]);
      const groupFields = groupData.trim().split(':');
      if (groupFields.length < 3) throw new Error(`Unable to resolve snapshot group: ${group}`);
      gid = Number(groupFields[2]);
      if (!Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot group: ${group}`);
    }
    return { uid, gid };
  }
  private async sendNotification(config: SnapshotConfig, category: NotificationCategory): Promise<string | null> {
    const notification = config.notifications; const provider = notification?.provider ?? 'none'; if (provider === 'none') return null;
    const channel: NotificationChannel | undefined = provider === 'pushover' ? notification?.pushover : provider === 'pushbullet' ? notification?.pushbullet : provider === 'ntfy' ? notification?.ntfy : notification?.pushsafer;
    if (!channel) return null;
    const key = category === 'unidentified' ? 'unidentifiedMessage' : category === 'people' ? 'personMessage' : category === 'animals' ? 'animalMessage' : 'vehicleMessage'; const message = channel[key as keyof NotificationChannel] as string | undefined; if (!message) return null;
    const soundKey = category === 'unidentified' ? 'unidentifiedSound' : category === 'people' ? 'personSound' : category === 'animals' ? 'animalSound' : 'vehicleSound'; const sound = channel[soundKey as keyof NotificationChannel] as string | undefined;
    const title = channel.title?.trim() || 'Snapshot Sensors';
    if (provider === 'pushover') {
      if (!channel.token || !channel.user) throw new Error('Pushover token and user are required.');
      const form = new URLSearchParams({ token: channel.token, user: channel.user, message, title, sound: sound?.trim() || 'pushover' }); if (channel.device?.trim()) form.set('device', channel.device.trim());
      const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`Pushover returned HTTP ${response.status}`); return 'Pushover';
    }
    if (provider === 'pushbullet') {
      if (!channel.apiKey) throw new Error('Pushbullet Access Token is required.');
      const push: Record<string, string> = { type: 'note', title, body: message }; if (channel.deviceIden) push.device_iden = channel.deviceIden; else if (channel.email) push.email = channel.email; else if (channel.channelTag) push.channel_tag = channel.channelTag;
      const response = await fetch('https://api.pushbullet.com/v2/pushes', { method: 'POST', headers: { 'Access-Token': channel.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(push), signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`Pushbullet returned HTTP ${response.status}`); return 'Pushbullet';
    }
    if (provider === 'ntfy') {
      const server = (channel.server?.trim() || 'https://ntfy.sh').replace(/\/+$/, ''); const topic = channel.topic?.trim(); if (!topic) throw new Error('ntfy Topic is required.');
      const url = `${server}/${encodeURIComponent(topic)}`; const headers: Record<string, string> = { 'Content-Type': 'text/plain; charset=utf-8', 'Title': title, 'Priority': String(channel.priority ?? 3) }; if (channel.tags?.trim()) headers.Tags = channel.tags.trim(); if (channel.accessToken?.trim()) headers.Authorization = `Bearer ${channel.accessToken.trim()}`;
      const response = await fetch(url, { method: 'POST', headers, body: message, signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`ntfy returned HTTP ${response.status}`); return 'ntfy';
    }
    if (!channel.privateKey?.trim()) throw new Error('Push Safer Private Key is required.');
    const form = new URLSearchParams({ k: channel.privateKey.trim(), t: title, m: message, d: channel.pushsaferDevice?.trim() || '', i: String(channel.icon ?? 1), v: String(channel.vibration ?? 1), p: String(channel.priority ?? 0) });
    if (sound?.trim()) form.set('s', sound.trim()); if (channel.iconColor?.trim()) form.set('c', channel.iconColor.trim()); if (channel.url?.trim()) form.set('u', channel.url.trim()); if (channel.urlTitle?.trim()) form.set('ut', channel.urlTitle.trim()); if (channel.timeToLive !== undefined) form.set('l', String(channel.timeToLive)); if (channel.retry !== undefined) form.set('re', String(channel.retry)); if (channel.expire !== undefined) form.set('ex', String(channel.expire));
    const response = await fetch('https://www.pushsafer.com/api', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) }); if (!response.ok) throw new Error(`Push Safer returned HTTP ${response.status}`);
    return 'Push Safer';
  }
}
