import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils';

class SnapshotSensorsUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/browse', this.handleBrowse.bind(this));
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
}

new SnapshotSensorsUiServer();
