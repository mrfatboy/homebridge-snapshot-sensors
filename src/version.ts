import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';

// Walk up from this file until package.json is found, so it resolves in both the
// Vitest source context (src/) and the compiled runtime (dist/src/). Mirrors the
// lookup in inference.ts, kept local to avoid coupling to the ONNX module.
function findPackageJson(from: string): string {
  let dir = from;
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error(`Cannot locate package.json from ${from}`);
}

function readVersion(): string {
  try {
    const path = findPackageJson(dirname(fileURLToPath(import.meta.url)));
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Resolved once at module load and reused for the AccessoryInformation
// FirmwareRevision so "what version are you on?" is answerable from the Home app.
export const PLUGIN_VERSION = readVersion();
