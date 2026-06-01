import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import {
  FRAME_WIDTH, FRAME_HEIGHT, FFMPEG_FPS,
  FFMPEG_TIMEOUT_FRAME_MS, FFMPEG_TIMEOUT_RESTART_MS,
} from './settings.js';

// ffmpeg-static is a CJS module exporting a plain string via module.exports.
const require = createRequire(import.meta.url);
const _ffmpegPath: string | null = require('ffmpeg-static') as string | null;
if (!_ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary for this platform');
const ffmpegBin: string = _ffmpegPath;

const BYTES_PER_FRAME = FRAME_WIDTH * FRAME_HEIGHT * 3;

export interface PumpLog {
  info(msg: string): void;
  warn(msg: string): void;
}

// Pulls the LATEST complete frame out of the rolling stdout buffer. ffmpeg can
// emit faster than inference consumes, so any older complete frames are dropped
// here — we never queue more than one frame. Returns a standalone copy of the
// newest frame (the detector mutates it in place during IR normalization, so it
// must not alias the pump's buffer) plus the trailing partial bytes to carry on.
export function takeLatestFrame(
  buf: Buffer,
  frameBytes: number,
): { latest: Buffer | null; rest: Buffer } {
  const whole = Math.floor(buf.length / frameBytes);
  if (whole === 0) return { latest: null, rest: buf };
  const lastStart = (whole - 1) * frameBytes;
  const latest = Buffer.from(buf.subarray(lastStart, lastStart + frameBytes));
  return { latest, rest: Buffer.from(buf.subarray(whole * frameBytes)) };
}

const FFMPEG_ARGS = (url: string): string[] => {
  // Force TCP for RTSP. Many cameras (and Docker's bridge network) drop the UDP
  // media path, so the stream "connects" with no error but delivers zero frames
  // — ffmpeg reports "Could not find codec parameters / Output file does not
  // contain any stream" and the watchdog then restarts forever. TCP keeps the
  // media on the connection that already works.
  return [
    '-loglevel', 'error',
    '-i', url,
    '-an',
    '-vf', `fps=${FFMPEG_FPS},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    'pipe:1',
  ];
};

// Long-lived ffmpeg that decodes an RTSP stream to raw RGB frames on stdout.
export class FfmpegPump {
  private ff: ChildProcess | null = null;
  private restarting: number | null = null;
  private latestFrame: Buffer | null = null;
  private latestFrameDate = 0;
  private gotFrame = false;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly log: PumpLog,
  ) {}

  start(): void {
    this.startProcess();
    this.watchdogTimer = setInterval(() => this.watchdog(), 500);
  }

  stop(): void {
    this.stopped = true;
    if (this.watchdogTimer !== null) clearInterval(this.watchdogTimer);
    this.kill();
  }

  takeFrame(): Buffer | null {
    const f = this.latestFrame;
    this.latestFrame = null;
    return f;
  }

  private startProcess(): void {
    if (this.stopped) return;

    this.gotFrame = false;
    let stderrTail = '';
    const child: ChildProcess = spawn(ffmpegBin, FFMPEG_ARGS(this.url), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.ff = child;
    this.latestFrameDate = Date.now();

    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => { stderrTail = (stderrTail + chunk).slice(-1024); });

    let buf: Buffer = Buffer.alloc(0);
    child.stdout!.on('data', (chunk: Buffer) => {
      if (child !== this.ff) return;
      this.restarting = null;
      this.latestFrameDate = Date.now();   // any bytes = ffmpeg alive
      buf = Buffer.concat([buf, chunk]);
      const { latest, rest } = takeLatestFrame(buf, BYTES_PER_FRAME);
      buf = rest;
      if (latest) {
        this.latestFrame = latest;   // overwrite: only the newest frame is kept
        if (!this.gotFrame) {
          this.gotFrame = true;
          this.log.info(`Receiving frames from ${this.url}`);
        }
      }
    });

    child.on('error', err => {
      if (child === this.ff) this.restart(`spawn error: ${err.message}`, stderrTail);
    });
    child.on('close', (code, signal) => {
      if (child === this.ff) this.restart(`exited (code=${code}, signal=${signal})`, stderrTail);
    });
  }

  private restart(reason: string, stderr = ''): void {
    if (this.stopped || this.restarting !== null) return;

    const detail = stderr.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
    this.log.warn(`Restarting ffmpeg: ${detail ? `${reason}: ${detail}` : reason}`);
    this.restarting = Date.now();
    this.kill();
    this.startProcess();
  }

  private watchdog(): void {
    if (!this.ff || this.stopped) return;
    const stale = Date.now() - this.latestFrameDate > FFMPEG_TIMEOUT_FRAME_MS;
    const pastCooldown = this.restarting === null || Date.now() - this.restarting > FFMPEG_TIMEOUT_RESTART_MS;
    if (stale && pastCooldown) {
      this.restarting = null;
      this.restart('watchdog timeout (no frames — check the camera URL/credentials and that the stream is reachable)');
    }
  }

  private kill(): void {
    if (!this.ff) return;
    try { this.ff.kill('SIGKILL'); } catch { /* already gone */ }
    this.ff = null;
  }
}
