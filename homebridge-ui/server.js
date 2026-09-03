import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fetchSnapshot } from '../dist/src/snapshot.js';
import { sendWebhook } from '../dist/src/webhook.js';
import { NotificationService } from '../dist/src/notifications/service.js';

const execFileAsync = promisify(execFile);
const TEST_NOTIFICATION_MESSAGE = 'This is a test';

class SnapshotSensorsUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/browse', this.handleBrowse.bind(this));
    this.onRequest('/test-snapshot', this.testSnapshot.bind(this));
    this.onRequest('/test-notification', this.testNotification.bind(this));
    this.onRequest('/test-webhook', this.testWebhook.bind(this));
    this.ready();
  }

  async handleBrowse(payload) {
    const { readdir } = await import('node:fs/promises');
    const pathModule = await import('node:path');
    const requestedPath = typeof payload?.path === 'string' && payload.path.trim() !== '' ? payload.path.trim() : '/';
    const directory = pathModule.resolve(requestedPath);
    const entries = await readdir(directory, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: pathModule.join(directory, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return { path: directory, parent: pathModule.dirname(directory), directories };
  }

  async testSnapshot(payload) {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
    const requestedDirectory = typeof payload?.directory === 'string' ? payload.directory.trim() : '';
    const ownership = typeof payload?.ownership === 'string' ? payload.ownership.trim() : '';
    const prefix = typeof payload?.prefix === 'string' ? payload.prefix.trim() : '';
    const storeSnapshots = typeof payload?.storeSnapshots === 'string' ? payload.storeSnapshots.trim().toLowerCase() : 'never';
    if (!url) throw new RequestError('Snapshot URL is required.', { status: 400 });
    if (!prefix) throw new RequestError('Snapshot prefix is required.', { status: 400 });
    if (!['never', 'normal', 'annotated'].includes(storeSnapshots)) throw new RequestError('Store snapshots setting is invalid.', { status: 400 });
    let parsed;
    try { parsed = new URL(url); } catch { throw new RequestError('The Snapshot URL is not valid.', { status: 400 }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new RequestError('The Snapshot URL must use HTTP or HTTPS.', { status: 400 });
    const pathModule = await import('node:path');
    const fs = await import('node:fs/promises');
    let directory = null;
    if (storeSnapshots !== 'never') {
      if (!requestedDirectory) throw new RequestError('Snapshot Directory is required when Store snapshots is Normal or Annotated.', { status: 400 });
      directory = pathModule.resolve(requestedDirectory);
      try {
        const stat = await fs.stat(directory);
        if (!stat.isDirectory()) throw new Error('The Snapshot Directory exists but is not a directory.');
      } catch (error) {
        if (error?.code === 'ENOENT') throw new RequestError('The Snapshot Directory does not exist.', { status: 400 });
        if (error instanceof RequestError) throw error;
        throw new RequestError(`The Snapshot Directory is invalid or inaccessible: ${error?.message || String(error)}`, { status: 400 });
      }
    }
    try {
      const { image: data, contentType } = await fetchSnapshot(parsed.toString());
      let outputImage = data;
      if (storeSnapshots !== 'never') {
        const { runYolo } = await import('../dist/src/yolo.js');
        const result = await runYolo(data, storeSnapshots);
        if (!result) throw new Error('YOLO is busy; please try again.');
        if (storeSnapshots === 'annotated' && result.createAnnotatedImage) outputImage = await result.createAnnotatedImage([]);
      }
      if (storeSnapshots === 'never') return { contentType, image: data.toString('base64'), saved: false };
      const extension = storeSnapshots === 'annotated' ? '.jpg' : (contentType.toLowerCase().includes('png') ? '.png' : '.jpg');
      const safePrefix = prefix.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, '_');
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const filename = `${safePrefix}-${timestamp}${extension}`;
      const filePath = pathModule.join(directory, filename);
      await fs.writeFile(filePath, outputImage);
      if (ownership) {
        const [username, group] = ownership.split(':', 2).map((part) => part.trim());
        if (!username) throw new Error('Snapshot Ownership Override must contain a username.');
        const { stdout: passwdOutput } = await execFileAsync('getent', ['passwd', username]);
        const passwdFields = passwdOutput.trim().split(':');
        if (passwdFields.length < 4) throw new Error(`Unable to resolve snapshot owner: ${username}`);
        const uid = Number(passwdFields[2]);
        let gid = Number(passwdFields[3]);
        if (!Number.isInteger(uid) || !Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot owner: ${username}`);
        if (group) {
          const { stdout: groupOutput } = await execFileAsync('getent', ['group', group]);
          const groupFields = groupOutput.trim().split(':');
          if (groupFields.length < 3) throw new Error(`Unable to resolve snapshot group: ${group}`);
          gid = Number(groupFields[2]);
          if (!Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot owner group: ${group}`);
        }
        await fs.chown(filePath, uid, gid);
      }
      return { contentType: storeSnapshots === 'annotated' ? 'image/jpeg' : contentType, image: outputImage.toString('base64'), filename, path: filePath, saved: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof RequestError) throw error;
      throw new RequestError(`Unable to retrieve snapshot: ${message}`, { status: 502 });
    }
  }

  async testWebhook(payload) {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
    const method = payload?.method === 'GET' ? 'GET' : 'POST';
    if (!url) throw new RequestError('Webhook URL is required.', { status: 400 });
    let parsed;
    try { parsed = new URL(url); } catch { throw new RequestError('The Webhook URL is not valid.', { status: 400 }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new RequestError('The Webhook URL must use HTTP or HTTPS.', { status: 400 });
    const payloadBody = { camera: 'Test', object: 'test', confidence: null };
    try {
      const response = await sendWebhook(parsed, method, payloadBody);
      const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
      if (!response.ok) {
        console.error(`[Snapshot Sensors] Webhook test ${method} failed: ${status}.`);
        throw new RequestError(`Unable to send webhook: HTTP ${response.status}`, { status: 502 });
      }
      console.log(`[Snapshot Sensors] Webhook test ${method}: ${status}.`);
      return { success: true, status: response.status, statusText: response.statusText || 'OK' };
    } catch (error) {
      if (error instanceof RequestError) throw error;
      const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const message = isTimeout ? 'timeout' : 'fetch failed';
      console.error(`[Snapshot Sensors] Webhook test ${method} failed: ${message}.`);
      throw new RequestError(`Unable to send webhook: ${message}`, { status: 502 });
    }
  }

  async testNotification(payload) {
    const provider = typeof payload?.provider === 'string' ? payload.provider.trim().toLowerCase() : 'none';
    if (provider === 'none') throw new RequestError('A notification provider is required.', { status: 400 });
    const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
    if (!title) throw new RequestError(`${provider} Title is required.`, { status: 400 });

    const channel = { ...payload };
    if (provider === 'pushcut' && typeof payload?.url === 'string') channel.pushcutUrl = payload.url.trim();
    const notification = { provider, [provider]: channel };

    try {
      const result = await NotificationService.send({ notification, title, message: TEST_NOTIFICATION_MESSAGE });
      console.log(`[Snapshot Sensors] Notification test: ${result.provider}: HTTP ${result.status}.`);
      return { success: true, status: result.status };
    } catch (error) {
      console.error(`[Snapshot Sensors] Notification test failed: ${provider} -> ${error instanceof Error ? error.message : String(error)}`);
      throw new RequestError(`Unable to send ${provider} notification: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
    }
  }
}

new SnapshotSensorsUiServer();
