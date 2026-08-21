import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

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
    const prefix = typeof payload?.prefix === 'string' ? payload.prefix.trim() : '';
    if (!url) throw new RequestError('Snapshot URL is required.', { status: 400 });
    if (!requestedDirectory) throw new RequestError('Snapshot Directory is required.', { status: 400 });
    if (!prefix) throw new RequestError('Snapshot prefix is required.', { status: 400 });

    let parsed;
    try { parsed = new URL(url); } catch { throw new RequestError('The Snapshot URL is not valid.', { status: 400 }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new RequestError('The Snapshot URL must use HTTP or HTTPS.', { status: 400 });
    }

    const pathModule = await import('node:path');
    const fs = await import('node:fs/promises');
    const directory = pathModule.resolve(requestedDirectory);

    let entries;
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) throw new Error('The Snapshot Directory exists but is not a directory.');
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') throw new RequestError('The Snapshot Directory does not exist.', { status: 400 });
      if (error instanceof RequestError) throw error;
      throw new RequestError(`The Snapshot Directory is invalid or inaccessible: ${error?.message || String(error)}`, { status: 400 });
    }

    const directoryEmpty = entries.length === 0;

    try {
      const response = await fetch(parsed, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Camera returned HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const data = Buffer.from(await response.arrayBuffer());
      if (!data.length) throw new Error('Camera returned an empty response');

      if (directoryEmpty) {
        return { contentType, image: data.toString('base64'), saved: false, directoryEmpty: true };
      }

      const extension = contentType.toLowerCase().includes('png') ? '.png' : '.jpg';
      const safePrefix = prefix.replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, '_');
      const filename = `${safePrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}${extension}`;
      const filePath = pathModule.join(directory, filename);
      await fs.writeFile(filePath, data);

      return { contentType, image: data.toString('base64'), filename, path: filePath, saved: true, directoryEmpty: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RequestError(`Unable to retrieve snapshot: ${message}`, { status: 502 });
    }
  }

  async testNotification(payload) {
    const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
    const user = typeof payload?.user === 'string' ? payload.user.trim() : '';
    const device = typeof payload?.device === 'string' ? payload.device.trim() : '';
    const sound = typeof payload?.sound === 'string' ? payload.sound.trim() : '';

    if (!token) throw new RequestError('Pushover Application Token is required.', { status: 400 });
    if (!user) throw new RequestError('Pushover User Key is required.', { status: 400 });
    if (!sound) throw new RequestError('Pushover Sound is required.', { status: 400 });

    const form = new URLSearchParams();
    form.set('token', token);
    form.set('user', user);
    form.set('message', 'This is a test');
    form.set('title', 'Snapshot Sensor');
    form.set('sound', sound);
    if (device) form.set('device', device);

    try {
      const response = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(15000),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.status !== 1) {
        const detail = Array.isArray(body?.errors) ? body.errors.join(', ') : `HTTP ${response.status}`;
        throw new Error(detail);
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RequestError(`Unable to send Pushover notification: ${message}`, { status: 502 });
    }
  }
}

new SnapshotSensorsUiServer();
