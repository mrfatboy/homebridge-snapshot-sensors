import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the heavy/native modules so discoverDevices() runs without ffmpeg or ONNX.
const workerInstances: Array<{ url: string; sensors: unknown[]; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; waitForStop: ReturnType<typeof vi.fn> }> = [];
vi.mock('../src/stream.js', () => ({
  StreamWorker: vi.fn(function (this: Record<string, unknown>, url: string, sensors: unknown[]) {
    this.url = url;
    this.sensors = sensors;
    this.start = vi.fn();
    this.stop = vi.fn();
    this.waitForStop = vi.fn().mockResolvedValue(undefined);
    workerInstances.push(this as never);
  }),
}));
vi.mock('../src/inference.js', () => ({
  loadModel: vi.fn().mockResolvedValue(undefined),
  closeModel: vi.fn().mockResolvedValue(undefined),
  runInference: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/accessory.js', () => ({
  StreamSensorAccessory: vi.fn(function (this: Record<string, unknown>) {
    this.setMotion = vi.fn();
  }),
}));

import { StreamSensorsPlatform } from '../src/platform.js';
import type { API, Logger, PlatformConfig } from 'homebridge';

// Minimal fake homebridge API that records registrations.
function makeApi() {
  const registered: Array<{ UUID: string; displayName: string }> = [];
  const unregistered: Array<{ UUID: string; displayName: string }> = [];
  const listeners: Record<string, () => void> = {};

  const api = {
    hap: {
      Service: { AccessoryInformation: {}, MotionSensor: {} },
      Characteristic: {},
      uuid: { generate: (s: string) => `uuid:${s}` },
    },
    on: (event: string, cb: () => void) => { listeners[event] = cb; },
    platformAccessory: function (this: Record<string, unknown>, name: string, uuid: string) {
      this.displayName = name;
      this.UUID = uuid;
      this.getService = () => ({ setCharacteristic() { return this; } });
    },
    registerPlatformAccessories: (_p: string, _n: string, accs: Array<{ UUID: string; displayName: string }>) => registered.push(...accs),
    unregisterPlatformAccessories: (_p: string, _n: string, accs: Array<{ UUID: string; displayName: string }>) => unregistered.push(...accs),
  } as unknown as API;

  return { api, registered, unregistered, listeners };
}

const makeLog = (): Logger => ({
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn(), log: vi.fn(),
} as unknown as Logger);

// Run the platform through didFinishLaunching and let the async chain settle.
async function launch(config: PlatformConfig, api: API, log: Logger, listeners: Record<string, () => void>) {
  new StreamSensorsPlatform(log, config, api);
  listeners['didFinishLaunching']?.();
  // loadModel() is mocked-resolved; flush the promise chain.
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
}

beforeEach(() => {
  workerInstances.length = 0;
  vi.clearAllMocks();
});

describe('discoverDevices()', () => {
  it('registers one accessory per sensor and starts a worker per stream', async () => {
    const { api, registered, listeners } = makeApi();
    const log = makeLog();
    await launch({
      platform: 'StreamSensors',
      streams: [{ name: 'Garden', url: 'rtsp://x', sensors: [{ categories: ['animals'] }, { categories: ['people'] }] }],
    } as unknown as PlatformConfig, api, log, listeners);

    expect(registered.map(a => a.displayName)).toEqual(['Garden Animals Sensor', 'Garden People Sensor']);
    expect(workerInstances).toHaveLength(1);
    expect(workerInstances[0].sensors).toHaveLength(2);
    expect(workerInstances[0].start).toHaveBeenCalled();
  });

  it('skips a stream with no name and does not start a worker for it', async () => {
    const { api, registered, listeners } = makeApi();
    const log = makeLog();
    await launch({
      platform: 'StreamSensors',
      streams: [
        { url: 'rtsp://noname', sensors: [{ categories: ['animals'] }] },
        { name: 'Good', url: 'rtsp://ok', sensors: [{ categories: ['people'] }] },
      ],
    } as unknown as PlatformConfig, api, log, listeners);

    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('missing a required "name"'));
    expect(registered.map(a => a.displayName)).toEqual(['Good People Sensor']);
    expect(workerInstances).toHaveLength(1);
  });

  it('does not start a worker for a stream whose sensors all dropped out', async () => {
    const { api, registered, listeners } = makeApi();
    const log = makeLog();
    await launch({
      platform: 'StreamSensors',
      streams: [{ name: 'Empty', url: 'rtsp://x', sensors: [{ categories: ['banana'] }] }],
    } as unknown as PlatformConfig, api, log, listeners);

    expect(registered).toHaveLength(0);
    expect(workerInstances).toHaveLength(0);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('has no sensors'));
  });

  it('drops a duplicate sensor name across streams', async () => {
    const { api, registered, listeners } = makeApi();
    const log = makeLog();
    await launch({
      platform: 'StreamSensors',
      streams: [
        { name: 'A', url: 'rtsp://a', sensors: [{ name: 'Shared', categories: ['animals'] }] },
        { name: 'B', url: 'rtsp://b', sensors: [{ name: 'Shared', categories: ['people'] }] },
      ],
    } as unknown as PlatformConfig, api, log, listeners);

    expect(registered.map(a => a.displayName)).toEqual(['Shared']); // only the first
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Duplicate sensor name'));
  });

  it('unregisters cached accessories that are no longer in the config', async () => {
    const { api, unregistered, listeners } = makeApi();
    const log = makeLog();
    const platform = new StreamSensorsPlatform(log, {
      platform: 'StreamSensors',
      streams: [{ name: 'Garden', url: 'rtsp://x', sensors: [{ categories: ['animals'] }] }],
    } as unknown as PlatformConfig, api);

    // Simulate a cached accessory from a previous run that no longer matches.
    platform.configureAccessory({ UUID: 'uuid:Stale Sensor', displayName: 'Stale Sensor' } as never);

    listeners['didFinishLaunching']?.();
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(unregistered.map(a => a.displayName)).toEqual(['Stale Sensor']);
  });
});
