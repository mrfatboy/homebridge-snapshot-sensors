import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge';
import { resolveSensors } from './categories.js';
import { matchingSensors } from './detector.js';
import { fetchSnapshot } from './snapshot.js';
import { runYolo } from './yolo.js';
import { NotificationService, notificationProvider } from './notifications/service.js';
import { sendWebhook as postWebhook } from './webhook.js';
import type { SensorSpec, SnapshotConfig, Category, StoreSnapshots } from './types.js';
import type { WebhookPayload } from './webhook.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, chown } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const TEST_IMAGE_PATH = process.env.SNAPSHOT_SENSORS_TEST_IMAGE?.trim();
type NotificationCategory = Category | 'unidentified';
type SnapshotRuntime = {
  config: SnapshotConfig;
  sensors: SensorSpec[];
  service: Service;
  running: boolean;
};
type OwnershipIds = { uid: number; gid: number };
const detectionMessages: Record<NotificationCategory, string> = {
  people: 'Person detected',
  animals: 'Animal detected',
  vehicles: 'Vehicle detected',
  unidentified: 'Unidentified Activity detected',
};
type BestDetection = { category: Category; score: number; className: string };

export class SnapshotSensorsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private readonly runtimes = new Map<string, SnapshotRuntime>();
  private readonly ownershipCache = new Map<string, Promise<OwnershipIds>>();
  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
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
    if (TEST_IMAGE_PATH)
      this.log.warn(`[Test Image] Development test image enabled: ${TEST_IMAGE_PATH}`);
    for (const snapshot of snapshots) {
      const snapshotName = typeof snapshot.name === 'string' ? snapshot.name.trim() : '';
      if (!snapshotName) {
        this.log.error('Snapshot is missing a required name — skipping it');
        continue;
      }
      const sensors: SensorSpec[] = resolveSensors(snapshotName, snapshot.sensors ?? [], (msg) =>
        this.log.warn(msg),
      );
      if (sensors.length === 0) {
        this.log.warn(`Snapshot "${snapshotName}" has no configured sensors — skipping it`);
        continue;
      }
      const uuid = this.api.hap.uuid.generate(
        `${this.config.name || 'SnapshotSensors'}:${snapshotName}`,
      );
      let accessory = this.accessories.find((candidate) => candidate.UUID === uuid);
      if (!accessory) {
        accessory = new this.api.platformAccessory(snapshotName, uuid);
        this.api.registerPlatformAccessories('SnapshotSensors', 'SnapshotSensors', [accessory]);
        this.accessories.push(accessory);
      }
      const service =
        accessory.getService(this.Service.Switch) ||
        accessory.addService(this.Service.Switch, snapshotName, 'snapshot-trigger');
      service.setCharacteristic(this.Characteristic.Name, snapshotName);
      service.getCharacteristic(this.Characteristic.On).onSet(async (value) => {
        if (value !== true) return;
        setTimeout(() => service.updateCharacteristic(this.Characteristic.On, false), 1000);
        void this.triggerSnapshot(snapshotName);
      });
      this.runtimes.set(snapshotName, { config: snapshot, sensors, service, running: false });
      this.log.info(
        `Configured snapshot "${snapshotName}" with ${sensors.length} sensor definition(s).`,
      );
    }
  }
  private async triggerSnapshot(snapshotName: string): Promise<void> {
    const runtime = this.runtimes.get(snapshotName);
    if (!runtime) return;
    if (runtime.running) {
      this.log.info(`[${snapshotName}] Snapshot already running; skipping duplicate trigger.`);
      return;
    }
    const startedAt = process.hrtime.bigint();
    runtime.running = true;
    let providerUsed = notificationProvider(runtime.config.notifications) ?? 'none';
    let detectionType = 'No objects matching the selected categories were detected';
    const store = (runtime.config.storeSnapshots ?? 'never') as StoreSnapshots;
    try {
      let image: Buffer;
      let contentType = 'image/jpeg';
      if (TEST_IMAGE_PATH) {
        image = await readFile(TEST_IMAGE_PATH);
        if (!image.length) throw new Error(`Test image is empty: ${TEST_IMAGE_PATH}`);
        this.log.info(`[${snapshotName}] [Test Image] Using ${TEST_IMAGE_PATH}`);
      } else {
        ({ image, contentType } = await fetchSnapshot(runtime.config.url));
      }
      const yolo = await runYolo(image, store);
      if (!yolo) {
        this.log.info(`[${snapshotName}] YOLO is busy; skipping snapshot detection.`);
        return;
      }
      if (TEST_IMAGE_PATH) {
        const acceptedCategories = [
          runtime.sensors.some((sensor) => sensor.categories.includes('animals')) ? 'Animal' : null,
          runtime.sensors.some((sensor) => sensor.categories.includes('people')) ? 'Person' : null,
          runtime.sensors.some((sensor) => sensor.categories.includes('vehicles'))
            ? 'Vehicle'
            : null,
          runtime.sensors.some((sensor) => sensor.unidentifiedMotionActivity)
            ? 'Unidentified Activity'
            : null,
        ].filter((category): category is string => category !== null);
        this.log.info(
          `[${snapshotName}] [Test Image] Accepted categories: ${acceptedCategories.join(', ')}`,
        );
        const details = yolo.detections
          .filter(
            (d) =>
              d.category !== null &&
              runtime.sensors.some(
                (sensor) =>
                  sensor.categories.includes(d.category!) &&
                  sensor.thresholds[d.category!] !== undefined &&
                  d.score >= sensor.thresholds[d.category!]!,
              ),
          )
          .map((d) => `${d.className} (${d.score.toFixed(3)})`);
        this.log.info(
          `[${snapshotName}] [Test Image] Accepted detections: ${details.length === 0 ? 'none' : details.join(', ')}`,
        );
      }
      const matched = matchingSensors(yolo.detections, runtime.sensors);
      let annotatedImage: Buffer | undefined;
      if (store === 'annotated' && matched.length > 0 && yolo.createAnnotatedImage)
        annotatedImage = await yolo.createAnnotatedImage(runtime.sensors);
      await this.saveSnapshot(runtime.config, image, annotatedImage, contentType);
      let webhookPayload: WebhookPayload | null = null;
      if (matched.length === 0) {
        const unidentifiedMotionActivityEnabled = runtime.sensors.some(
          (sensor) => sensor.unidentifiedMotionActivity,
        );
        if (yolo.detections.length > 0 && unidentifiedMotionActivityEnabled) {
          detectionType = detectionMessages.unidentified;
          void this.sendNotification(runtime.config, 'unidentified');
          webhookPayload = { camera: snapshotName, object: 'unidentified', confidence: null };
        }
      } else {
        let bestMatch: BestDetection | null = null;
        for (const sensor of matched) {
          for (const detection of yolo.detections) {
            const category = detection.category;
            if (!category || !sensor.categories.includes(category)) continue;
            if (detection.score < (sensor.thresholds[category] ?? 0.25)) continue;
            if (!bestMatch || detection.score > bestMatch.score)
              bestMatch = { category, score: detection.score, className: detection.className };
          }
        }
        if (bestMatch) {
          detectionType = detectionMessages[bestMatch.category];
          void this.sendNotification(runtime.config, bestMatch.category);
          webhookPayload = {
            camera: snapshotName,
            object: bestMatch.className,
            confidence: bestMatch.score,
          };
        }
      }
      if (webhookPayload) void this.sendWebhook(runtime.config, webhookPayload);
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.log.info(
        `[${snapshotName}] ${TEST_IMAGE_PATH ? '[Test Image] ' : ''}${detectionType}; notification provider: ${providerUsed}; image saved: ${store}; total elapsed time: ${this.formatElapsed(elapsedMs)}.`,
      );
    } catch (error) {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.log.error(
        `[${snapshotName}] Snapshot detection failed after ${this.formatElapsed(elapsedMs)} — ${TEST_IMAGE_PATH ? '[Test Image] ' : ''}${detectionType}; notification provider: ${providerUsed}; image saved: ${store}; error: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      runtime.running = false;
      runtime.service.updateCharacteristic(this.Characteristic.On, false);
    }
  }
  private async sendWebhook(config: SnapshotConfig, payload: WebhookPayload): Promise<void> {
    const webhook = config.webhook;
    if (!webhook?.enabled || !webhook.url?.trim()) return;
    const method = webhook.method === 'GET' ? 'GET' : 'POST';
    let parsed: URL;
    try {
      parsed = new URL(webhook.url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('Webhook URL must use HTTP or HTTPS');
    } catch {
      this.log.warn(`[${config.name}] Webhook failed: ${method} [invalid URL]`);
      return;
    }
    try {
      const response = await postWebhook(parsed, method, payload);
      const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
      if (!response.ok) {
        this.log.warn(`[${config.name}] Webhook ${method} failed: ${status}.`);
        return;
      }
      this.log.info(`[${config.name}] Webhook ${method}: ${status}.`);
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.log.warn(
        `[${config.name}] Webhook ${method} failed: ${isTimeout ? 'timeout' : 'fetch failed'}.`,
      );
    }
  }
  private formatElapsed(ms: number): string {
    return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
  }
  private async saveSnapshot(
    config: SnapshotConfig,
    image: Buffer,
    annotated: Buffer | undefined,
    contentType: string,
  ): Promise<void> {
    const store = config.storeSnapshots ?? 'never';
    if (store === 'never') return;
    const directory = config.snapshotDirectory?.trim();
    if (!directory) throw new Error('Snapshot Directory is required when storing snapshots.');
    await mkdir(directory, { recursive: true });
    const prefix = (config.snapshotPrefix?.trim() || config.name)
      .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${randomUUID().slice(0, 8)}${store === 'annotated' ? '.jpg' : contentType.toLowerCase().includes('png') ? '.png' : '.jpg'}`;
    const filePath = path.join(directory, filename);
    await writeFile(filePath, store === 'annotated' && annotated ? annotated : image);
    await this.applyOwnership(filePath, config.snapshotOwnership);
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
    const [username, group] = ownership.split(':', 2).map((part) => part.trim());
    if (!username) throw new Error('Snapshot Ownership Override must contain a username.');
    const { stdout: passwd } = await execFileAsync('getent', ['passwd', username]);
    const fields = passwd.trim().split(':');
    if (fields.length < 4) throw new Error(`Unable to resolve snapshot owner: ${username}`);
    const uid = Number(fields[2]);
    let gid = Number(fields[3]);
    if (!Number.isInteger(uid) || !Number.isInteger(gid))
      throw new Error(`Unable to resolve snapshot owner: ${username}`);
    if (group) {
      const { stdout: groupData } = await execFileAsync('getent', ['group', group]);
      const groupFields = groupData.trim().split(':');
      if (groupFields.length < 3) throw new Error(`Unable to resolve snapshot group: ${group}`);
      gid = Number(groupFields[2]);
      if (!Number.isInteger(gid))
        throw new Error(`Unable to resolve snapshot owner group: ${group}`);
    }
    return { uid, gid };
  }
  private async sendNotification(
    config: SnapshotConfig,
    category: NotificationCategory,
  ): Promise<void> {
    const notification = config.notifications;
    if (!notification || notification.provider === 'none' || !notification.provider) return;
    const provider = notificationProvider(notification);
    const providerName = provider ?? 'none';
    const channel = notification[notification.provider];
    if (!channel) return;
    const message = NotificationService.messageFor(channel, category);
    if (!message) return;
    const sound = NotificationService.soundFor(channel, category);
    try {
      const result = await NotificationService.send({
        notification,
        title: channel.title?.trim() || 'Snapshot Sensors',
        message,
        sound,
      });
      this.log.info(`[${config.name}] ${providerName} notification sent: HTTP ${result.status}.`);
    } catch (error) {
      this.log.warn(
        `[${config.name}] Notification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
