import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
import { FfmpegPump, takeLatestFrame, classifyFfmpegError } from '../src/ffmpeg.js';
import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  FFMPEG_TIMEOUT_FRAME_MS,
  FFMPEG_TIMEOUT_RESTART_MS,
} from '../src/settings.js';
import type { StreamHealth } from '../src/types.js';

const F = 6; // pretend a "frame" is 6 bytes for these tests
const frame = (fill: number): Buffer => Buffer.alloc(F, fill);

// A full decoded frame, the size the pump actually expects on stdout.
const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 3;
const fullFrame = Buffer.alloc(FRAME_BYTES);

// Stand-in for a spawned ffmpeg child: an EventEmitter for the process plus
// EventEmitter stdout/stderr, recording kill() so tests can assert teardown.
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter & { setEncoding: (enc: string) => void };
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
}

const children: FakeChild[] = [];

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  const stderr = new EventEmitter() as FakeChild['stderr'];
  stderr.setEncoding = () => {};
  child.stderr = stderr;
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

const makeLog = () => ({ info: vi.fn(), warn: vi.fn() });

describe('takeLatestFrame() — only ever keeps the newest frame', () => {
  it('returns null and keeps a partial frame untouched', () => {
    const partial = Buffer.from([1, 2, 3]);
    const { latest, rest } = takeLatestFrame(partial, F);
    expect(latest).toBeNull();
    expect(rest.equals(partial)).toBe(true);
  });

  it('returns the single frame and an empty remainder', () => {
    const { latest, rest } = takeLatestFrame(frame(7), F);
    expect(latest!.equals(frame(7))).toBe(true);
    expect(rest.length).toBe(0);
  });

  it('drops older frames and returns only the latest when several are buffered', () => {
    // three whole frames back-to-back: 0xAA, 0xBB, 0xCC
    const buf = Buffer.concat([frame(0xaa), frame(0xbb), frame(0xcc)]);
    const { latest, rest } = takeLatestFrame(buf, F);
    expect(latest!.equals(frame(0xcc))).toBe(true); // newest only
    expect(rest.length).toBe(0);
  });

  it('keeps trailing partial bytes after consuming whole frames', () => {
    const tail = Buffer.from([9, 9]);
    const buf = Buffer.concat([frame(0xaa), frame(0xbb), tail]);
    const { latest, rest } = takeLatestFrame(buf, F);
    expect(latest!.equals(frame(0xbb))).toBe(true);
    expect(rest.equals(tail)).toBe(true);
  });

  it('returns a standalone copy that does not alias the input buffer', () => {
    const buf = Buffer.concat([frame(0x11), frame(0x22)]);
    const { latest } = takeLatestFrame(buf, F);
    buf.fill(0); // mutating the source must not corrupt the returned frame
    expect(latest!.equals(frame(0x22))).toBe(true);
  });
});

describe('classifyFfmpegError() — actionable hints from stderr', () => {
  it('flags authentication failures', () => {
    expect(classifyFfmpegError('rtsp://cam: 401 Unauthorized')).toMatch(/authentication/);
    expect(classifyFfmpegError('403 Forbidden')).toMatch(/authentication/);
  });

  it('flags unreachable cameras', () => {
    expect(classifyFfmpegError('tcp://x: Connection refused')).toMatch(/unreachable/);
    expect(classifyFfmpegError('No route to host')).toMatch(/unreachable/);
    expect(classifyFfmpegError('Connection timed out')).toMatch(/unreachable/);
  });

  it('flags a missing stream path', () => {
    expect(classifyFfmpegError('Server returned 404 Not Found')).toMatch(/path not found/);
  });

  it('flags undecodable streams', () => {
    expect(classifyFfmpegError('Invalid data found when processing input')).toMatch(/decode/);
    expect(classifyFfmpegError('Could not find codec parameters')).toMatch(/decode/);
  });

  it('returns null when nothing recognizable matched', () => {
    expect(classifyFfmpegError('')).toBeNull();
    expect(classifyFfmpegError('frame= 12 fps=1.0')).toBeNull();
  });
});

describe('FfmpegPump lifecycle', () => {
  beforeEach(() => {
    children.length = 0;
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation(() => {
      const child = makeFakeChild();
      children.push(child);
      return child as never;
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawns ffmpeg on start', () => {
    const pump = new FfmpegPump('rtsp://cam', makeLog());
    pump.start();
    expect(spawn).toHaveBeenCalledOnce();
    expect(children).toHaveLength(1);
    pump.stop();
  });

  it('takeFrame() hands back the latest decoded frame, then nulls it', () => {
    const pump = new FfmpegPump('rtsp://cam', makeLog());
    pump.start();
    children[0].stdout.emit('data', fullFrame);
    expect(pump.takeFrame()?.length).toBe(FRAME_BYTES);
    expect(pump.takeFrame()).toBeNull(); // only one frame is ever queued
    pump.stop();
  });

  it('restarts once when the watchdog sees no frames past the timeout', () => {
    const log = makeLog();
    const pump = new FfmpegPump('rtsp://cam', log);
    pump.start();
    expect(children).toHaveLength(1);

    vi.advanceTimersByTime(FFMPEG_TIMEOUT_FRAME_MS + 1000);

    expect(children).toHaveLength(2); // killed the stale child, spawned a fresh one
    expect(children[0].killed).toBe(true);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('watchdog timeout'));
    pump.stop();
  });

  it('does not restart again within the restart cooldown window', () => {
    const pump = new FfmpegPump('rtsp://cam', makeLog());
    pump.start();
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_FRAME_MS + 1000); // first restart
    expect(children).toHaveLength(2);

    // The new child is also frameless, but we're still inside the cooldown.
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_FRAME_MS + 1000);
    expect(FFMPEG_TIMEOUT_RESTART_MS).toBeGreaterThan(2 * FFMPEG_TIMEOUT_FRAME_MS);
    expect(children).toHaveLength(2); // no second restart yet
    pump.stop();
  });

  it('does not restart while frames keep arriving', () => {
    const pump = new FfmpegPump('rtsp://cam', makeLog());
    pump.start();
    for (let i = 0; i < 25; i++) {
      children.at(-1)!.stdout.emit('data', fullFrame);
      vi.advanceTimersByTime(500);
    }
    expect(children).toHaveLength(1);
    pump.stop();
  });

  it('restarts on an unexpected ffmpeg exit', () => {
    const log = makeLog();
    const pump = new FfmpegPump('rtsp://cam', log);
    pump.start();
    children[0].emit('close', 1, null);
    expect(children).toHaveLength(2);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('exited'));
    pump.stop();
  });

  it('restarts and reports the cause on a spawn error', () => {
    const log = makeLog();
    const pump = new FfmpegPump('rtsp://cam', log);
    pump.start();
    children[0].emit('error', new Error('ENOENT'));
    expect(children).toHaveLength(2);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('spawn error'));
    pump.stop();
  });

  it('surfaces a classified hint from the failing child stderr', () => {
    const log = makeLog();
    const pump = new FfmpegPump('rtsp://cam', log);
    pump.start();
    children[0].stderr.emit('data', 'method DESCRIBE failed: 401 Unauthorized\n');
    children[0].emit('close', 1, null);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('authentication failed'));
    pump.stop();
  });

  it('stop() kills the child and blocks any further restart', () => {
    const pump = new FfmpegPump('rtsp://cam', makeLog());
    pump.start();
    pump.stop();
    expect(children[0].killed).toBe(true);

    // A close arriving after stop() must not respawn, nor must the watchdog.
    children[0].emit('close', null, 'SIGKILL');
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_FRAME_MS + 1000);
    expect(children).toHaveLength(1);
  });

  it('reports health: connecting stays silent, then online once frames flow', () => {
    const health: StreamHealth[] = [];
    const pump = new FfmpegPump('rtsp://cam', makeLog(), (h) => health.push(h));
    pump.start();

    vi.advanceTimersByTime(1000); // still connecting, within grace → no event
    expect(health).toEqual([]);

    children.at(-1)!.stdout.emit('data', fullFrame);
    vi.advanceTimersByTime(600); // a watchdog tick observes the frame
    expect(health).toEqual(['online']);
    pump.stop();
  });

  it('reports health: down when a never-connecting stream passes the timeout', () => {
    const health: StreamHealth[] = [];
    const pump = new FfmpegPump('rtsp://cam', makeLog(), (h) => health.push(h));
    pump.start();
    vi.advanceTimersByTime(FFMPEG_TIMEOUT_FRAME_MS + 1000);
    expect(health.at(-1)).toBe('down');
    pump.stop();
  });

  it('reports health: online then down when frames stop', () => {
    const health: StreamHealth[] = [];
    const pump = new FfmpegPump('rtsp://cam', makeLog(), (h) => health.push(h));
    pump.start();
    children.at(-1)!.stdout.emit('data', fullFrame);
    vi.advanceTimersByTime(600);
    expect(health).toContain('online');

    vi.advanceTimersByTime(FFMPEG_TIMEOUT_FRAME_MS + 1000);
    expect(health.at(-1)).toBe('down');
    pump.stop();
  });
});
