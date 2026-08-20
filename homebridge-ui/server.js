import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { HomebridgePluginUiServer, RequestError } from '@homebridge/plugin-ui-utils';

class SnapshotSensorsUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/browse', this.handleBrowse.bind(this));
    this.onRequest('/test-snapshot', this.handleTestSnapshot.bind(this));
    this.ready();
  }

  async handleBrowse(payload) {
    const requestedPath = typeof payload?.path === 'string' && payload.path.trim() !== ''
      ? payload.path.trim()
      : '/';

    const directory = path.resolve(requestedPath);
    const entries = await readdir(directory, { withFileTypes: true });
    const directories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(directory, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    return {
      path: directory,
      parent: path.dirname(directory),
      directories,
    };
  }

  async handleTestSnapshot(payload) {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : '';

    if (!url) {
      throw new RequestError('Snapshot URL is required.', { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new RequestError('The Snapshot URL is not valid.', { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new RequestError('The Snapshot URL must use HTTP or HTTPS.', { status: 400 });
    }

    try {
      const response = await fetch(parsed, { signal: AbortSignal.timeout(15000) });

      if (!response.ok) {
        throw new Error(`Camera returned HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const data = Buffer.from(await response.arrayBuffer());

      if (data.length === 0) {
        throw new Error('Camera returned an empty response');
      }

      return {
        contentType,
        image: data.toString('base64'),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new RequestError(`Unable to retrieve snapshot: ${message}`, { status: 502 });
    }
  }
}

new SnapshotSensorsUiServer();
