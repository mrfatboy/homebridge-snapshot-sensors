import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TEST_NOTIFICATION_MESSAGE = 'This is a test';

class SnapshotSensorsUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/browse', this.handleBrowse.bind(this));
    this.onRequest('/test-snapshot', this.testSnapshot.bind(this));
    this.onRequest('/test-notification', this.testNotification.bind(this));
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
      const response = await fetch(parsed, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Camera returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length) throw new Error('Camera returned an empty response');
      let outputImage = data;
      if (storeSnapshots !== 'never') {
        const { runYolo } = await import('../dist/src/yolo.js');
        const result = await runYolo(data, storeSnapshots);
        if (storeSnapshots === 'annotated' && result.annotatedImage) outputImage = result.annotatedImage;
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
          if (!Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot group: ${group}`);
        }
        await fs.chown(filePath, uid, gid);
      }
      return { contentType: storeSnapshots === 'annotated' ? 'image/jpeg' : contentType, image: outputImage.toString('base64'), filename, path: filePath, saved: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RequestError(`Unable to retrieve snapshot: ${message}`, { status: 502 });
    }
  }

  async testNotification(payload) {
    const provider = typeof payload?.provider === 'string' ? payload.provider.trim().toLowerCase() : 'none';
    if (provider === 'pushover') {
      const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
      const user = typeof payload?.user === 'string' ? payload.user.trim() : '';
      const device = typeof payload?.device === 'string' ? payload.device.trim() : '';
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!token) throw new RequestError('Pushover Application Token is required.', { status: 400 });
      if (!user) throw new RequestError('Pushover User Key is required.', { status: 400 });
      if (!title) throw new RequestError('Pushover Title is required.', { status: 400 });
      const form = new URLSearchParams();
      form.set('token', token); form.set('user', user); form.set('message', TEST_NOTIFICATION_MESSAGE); form.set('title', title); form.set('sound', 'pushover');
      if (device) form.set('device', device);
      try {
        const response = await fetch('https://api.pushover.net/1/messages.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.status !== 1) throw new Error(Array.isArray(body?.errors) ? body.errors.join(', ') : `HTTP ${response.status}`);
        return { success: true };
      } catch (error) {
        throw new RequestError(`Unable to send Pushover notification: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
      }
    }

    if (provider === 'pushbullet') {
      const apiKey = typeof payload?.apiKey === 'string' ? payload.apiKey.trim() : '';
      const deviceIden = typeof payload?.deviceIden === 'string' ? payload.deviceIden.trim() : '';
      const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
      const channelTag = typeof payload?.channelTag === 'string' ? payload.channelTag.trim() : '';
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!apiKey) throw new RequestError('Pushbullet Access Token is required.', { status: 400 });
      if (!title) throw new RequestError('Pushbullet Title is required.', { status: 400 });
      const targets = [deviceIden, email, channelTag].filter(Boolean);
      if (targets.length > 1) throw new RequestError('Specify only one Pushbullet target: Device Identifier, Email, or Channel Tag.', { status: 400 });
      const push = { type: 'note', title, body: TEST_NOTIFICATION_MESSAGE };
      if (deviceIden) push.device_iden = deviceIden;
      else if (email) push.email = email;
      else if (channelTag) push.channel_tag = channelTag;
      try {
        const response = await fetch('https://api.pushbullet.com/v2/pushes', { method: 'POST', headers: { 'Access-Token': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(push), signal: AbortSignal.timeout(15000) });
        const responseText = await response.text();
        if (!response.ok) throw new Error(responseText || `HTTP ${response.status}`);
        return { success: true };
      } catch (error) {
        throw new RequestError(`Unable to send Pushbullet notification: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
      }
    }

    if (provider === 'ntfy') {
      const server = typeof payload?.server === 'string' ? payload.server.trim() : '';
      const topic = typeof payload?.topic === 'string' ? payload.topic.trim() : '';
      const accessToken = typeof payload?.accessToken === 'string' ? payload.accessToken.trim() : '';
      const priority = Number(payload?.priority ?? 3);
      const tags = typeof payload?.tags === 'string' ? payload.tags.trim() : '';
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      if (!server) throw new RequestError('ntfy Server URL is required.', { status: 400 });
      if (!topic) throw new RequestError('ntfy Topic is required.', { status: 400 });
      if (!title) throw new RequestError('ntfy Title is required.', { status: 400 });
      let parsedServer;
      try { parsedServer = new URL(server); } catch { throw new RequestError('The ntfy Server URL is not valid.', { status: 400 }); }
      if (!['http:', 'https:'].includes(parsedServer.protocol)) throw new RequestError('The ntfy Server URL must use HTTP or HTTPS.', { status: 400 });
      const endpoint = new URL(topic, `${parsedServer.toString().replace(/\/$/, '')}/`);
      const headers = { 'Content-Type': 'text/plain', 'Title': title, 'Priority': String(Number.isFinite(priority) ? priority : 3) };
      if (tags) headers.Tags = tags;
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      try {
        const response = await fetch(endpoint, { method: 'POST', headers, body: TEST_NOTIFICATION_MESSAGE, signal: AbortSignal.timeout(15000) });
        const responseText = await response.text();
        if (!response.ok) throw new Error(responseText || `HTTP ${response.status}`);
        return { success: true };
      } catch (error) {
        throw new RequestError(`Unable to send ntfy notification: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
      }
    }

    if (provider === 'pushsafer') {
      const privateKey = typeof payload?.privateKey === 'string' ? payload.privateKey.trim() : '';
      const pushsaferDevice = typeof payload?.pushsaferDevice === 'string' ? payload.pushsaferDevice.trim() : '';
      const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
      const icon = Number(payload?.icon ?? 1);
      const vibration = Number(payload?.vibration ?? 1);
      const iconColor = typeof payload?.iconColor === 'string' ? payload.iconColor.trim() : '';
      const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
      const urlTitle = typeof payload?.urlTitle === 'string' ? payload.urlTitle.trim() : '';
      const priority = Number(payload?.priority ?? 0);
      const timeToLive = payload?.timeToLive;
      const retry = payload?.retry;
      const expire = payload?.expire;
      if (!privateKey) throw new RequestError('Push Safer Private Key is required.', { status: 400 });
      if (!title) throw new RequestError('Push Safer Title is required.', { status: 400 });
      const form = new URLSearchParams();
      form.set('k', privateKey); form.set('t', title); form.set('m', TEST_NOTIFICATION_MESSAGE);
      if (pushsaferDevice) form.set('d', pushsaferDevice);
      if (Number.isFinite(icon)) form.set('i', String(icon));
      if (Number.isFinite(vibration)) form.set('v', String(vibration));
      if (iconColor) form.set('c', iconColor);
      if (url) form.set('u', url);
      if (urlTitle) form.set('ut', urlTitle);
      if (Number.isFinite(priority)) form.set('p', String(priority));
      if (timeToLive !== undefined && timeToLive !== null && String(timeToLive).trim() !== '') form.set('l', String(timeToLive).trim());
      if (retry !== undefined && retry !== null && String(retry).trim() !== '') form.set('re', String(retry).trim());
      if (expire !== undefined && expire !== null && String(expire).trim() !== '') form.set('ex', String(expire).trim());
      try {
        const response = await fetch('https://www.pushsafer.com/api', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(), signal: AbortSignal.timeout(15000) });
        const responseText = await response.text();
        if (!response.ok) throw new Error(responseText || `HTTP ${response.status}`);
        return { success: true };
      } catch (error) {
        throw new RequestError(`Unable to send Push Safer notification: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
      }
    }

    throw new RequestError('A notification provider must be selected.', { status: 400 });
  }
}

new SnapshotSensorsUiServer();
