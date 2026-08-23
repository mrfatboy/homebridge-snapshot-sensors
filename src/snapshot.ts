import { mkdir, writeFile, chown } from 'fs/promises';
import { dirname, join } from 'path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from 'homebridge';

const SNAPSHOT_TIMEOUT_MS = 15_000;
const execFile = promisify(execFileCallback);

export async function fetchSnapshot(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Snapshot request timed out after ${SNAPSHOT_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

async function resolveOwnership(owner: string): Promise<{ uid: number; gid: number }> {
  const value = owner.trim();
  if (!value) throw new Error('Snapshot ownership override cannot be empty');

  const [username, group] = value.split(':', 2).map((part) => part.trim());
  if (!username) throw new Error('Snapshot ownership override must contain a username');

  const { stdout } = await execFile('getent', ['passwd', username]);
  const passwd = stdout.trim().split(':');
  if (passwd.length < 4) throw new Error(`Unable to resolve snapshot owner: ${username}`);
  const uid = Number(passwd[2]);
  const primaryGid = Number(passwd[3]);
  if (!Number.isInteger(uid) || !Number.isInteger(primaryGid)) throw new Error(`Unable to resolve snapshot owner: ${username}`);

  let gid = primaryGid;
  if (group) {
    const { stdout: groupOutput } = await execFile('getent', ['group', group]);
    const groupFields = groupOutput.trim().split(':');
    if (groupFields.length < 3) throw new Error(`Unable to resolve snapshot group: ${group}`);
    gid = Number(groupFields[2]);
    if (!Number.isInteger(gid)) throw new Error(`Unable to resolve snapshot group: ${group}`);
  }

  return { uid, gid };
}

export async function saveSnapshot(
  image: Buffer,
  directory: string,
  prefix: string,
  suffix: string,
  log: Logger,
  ownership?: string,
): Promise<string> {
  if (!directory.trim()) throw new Error('Snapshot Directory is required when storing snapshots');
  const safePrefix = prefix.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || 'SnapshotSensor';
  const filename = `${safePrefix}_${timestamp()}${suffix}`;
  const path = join(directory, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, image);

  if (ownership?.trim()) {
    const { uid, gid } = await resolveOwnership(ownership);
    try {
      await chown(path, uid, gid);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to apply Snapshot Ownership Override "${ownership}": ${message}`);
    }
    log.info(`Applied snapshot ownership ${ownership.trim()} to ${path}`);
  }

  log.info(`Saved snapshot: ${path}`);
  return path;
}
