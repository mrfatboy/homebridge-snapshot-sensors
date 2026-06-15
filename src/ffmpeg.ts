import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  FFMPEG_FPS,
  FFMPEG_TIMEOUT_FRAME_MS,
  FFMPEG_TIMEOUT_RESTART_MS,
} from './settings.js';
import type { StreamHealth } from './types.js';

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
  if (whole === 0)
    return {
      latest: null,
      rest: buf,
    };
  const lastStart = (whole - 1) * frameBytes;
  const latest = Buffer.from(buf.subarray(lastStart, lastStart + frameBytes));
  return {
    latest,
    rest: Buffer.from(buf.subarray(whole * frameBytes)),
  };
}

const FFMPEG_ARGS = (url: string): string[] => {
  // Force TCP for RTSP. Many cameras (and Docker's bridge network) drop the UDP
  // media path, so the stream "connects" with no error but delivers zero frames
  // — ffmpeg reports "Could not find codec parameters / Output file does not
  // contain any stream" and the watchdog then restarts forever. TCP keeps the
  // media on the connection that already works.
  return [
    '-loglevel',
    'error',
    '-i',
    url,
    '-an',
    '-vf',
    `fps=${FFMPEG_FPS},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    'pipe:1',
  ];
};

// Map an ffmpeg stderr tail onto a short, actionable hint so the dominant
// first-run failures (wrong URL, bad credentials, unreachable camera) point at a
// cause instead of a generic "no frames". Returns null when nothing recognizable
// matched, so the caller falls back to the raw stderr tail.
export function classifyFfmpegError(stderr: string): string | null {
  const s = stderr.toLowerCase();
  if (/401|unauthorized|authentication|auth.*fail|\b403\b|forbidden/.test(s))
    return 'authentication failed — check the username/password in the stream URL';
  if (
    /connection refused|no route to host|network is unreachable|connection timed out|timed out|etimedout|ehostunreach|econnrefused|name or service not known/.test(
      s,
    )
  )
    return 'camera unreachable — check the host/port and that the camera is reachable from the Homebridge host';
  if (/\b404\b|not found|no such file/.test(s))
    return 'stream path not found — check the URL path/channel';
  if (
    /invalid data|could not find codec|codec parameters|does not contain any stream|decoder|unknown encoder|unsupported|protocol not found/.test(
      s,
    )
  )
    return 'could not decode the stream — verify the URL path and that ffmpeg supports the codec/transport';
  return null;
}

// Long-lived ffmpeg that decodes an RTSP stream to raw RGB frames on stdout.
export class FfmpegPump {
  private ff: ChildProcess | null = null;
  private restarting: number | null = null;
  private latestFrame: Buffer | null = null;
  private latestFrameDate = 0;
  private gotFrame = false;
  private everFramed = false; // a full frame has been decoded at least once (pump lifetime)
  private lastFrameAt = 0; // timestamp of the most recent full frame
  private startedAt = 0; // when start() was first called
  private health: StreamHealth = 'connecting';
  private stderrTail = ''; // rolling tail of the current child's stderr, for diagnostics
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    // Display label for logs. The url carries credentials, so never log it; use
    // the (validated, non-empty) stream name instead.
    private readonly name: string,
    private readonly log: PumpLog,
    private readonly onHealth?: (health: StreamHealth) => void,
  ) {}

  start(): void {
    this.startedAt = Date.now();
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
    this.stderrTail = '';
    const child: ChildProcess = spawn(ffmpegBin, FFMPEG_ARGS(this.url), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.ff = child;
    this.latestFrameDate = Date.now();

    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => {
      if (child !== this.ff) return;
      this.stderrTail = (this.stderrTail + chunk).slice(-1024);
    });

    let buf: Buffer = Buffer.alloc(0);
    child.stdout!.on('data', (chunk: Buffer) => {
      if (child !== this.ff) return;
      this.restarting = null;
      this.latestFrameDate = Date.now(); // any bytes = ffmpeg alive
      buf = Buffer.concat([buf, chunk]);
      const { latest, rest } = takeLatestFrame(buf, BYTES_PER_FRAME);
      buf = rest;
      if (latest) {
        this.latestFrame = latest; // overwrite: only the newest frame is kept
        this.lastFrameAt = Date.now();
        this.everFramed = true;
        if (!this.gotFrame) {
          this.gotFrame = true;
          this.log.info(`Receiving frames from ${this.name}`);
        }
      }
    });

    child.on('error', (err) => {
      if (child === this.ff) this.restart(`spawn error: ${err.message}`);
    });
    child.on('close', (code, signal) => {
      if (child === this.ff) this.restart(`exited (code=${code}, signal=${signal})`);
    });
  }

  private restart(reason: string): void {
    if (this.stopped || this.restarting !== null) return;

    // Pull both the raw tail (for context) and a classified hint (for the cause)
    // off the current child's captured stderr. The watchdog path reaches this too,
    // so a silent no-frames restart still surfaces any hint ffmpeg did emit.
    const detail = this.stderrTail.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
    const hint = classifyFfmpegError(this.stderrTail);
    const message = (detail ? `${reason}: ${detail}` : reason) + (hint ? ` — ${hint}` : '');
    this.log.warn(`Restarting ffmpeg: ${message}`);
    this.restarting = Date.now();
    this.kill();
    this.startProcess();
  }

  private watchdog(): void {
    if (this.stopped) return;
    this.evaluateHealth();
    if (!this.ff) return;
    const stale = Date.now() - this.latestFrameDate > FFMPEG_TIMEOUT_FRAME_MS;
    const pastCooldown =
      this.restarting === null || Date.now() - this.restarting > FFMPEG_TIMEOUT_RESTART_MS;
    if (stale && pastCooldown) {
      this.restarting = null;
      this.restart(
        'watchdog timeout (no frames — check the stream URL/credentials and that the stream is reachable)',
      );
    }
  }

  // Map the pump's frame timing onto a coarse health state and notify on change.
  // Liveness uses the last COMPLETE frame (lastFrameAt), not the any-bytes
  // timestamp the restart watchdog uses — a stream emitting partial bytes but no
  // decodable frame is useless for detection and should read as down. Once a
  // frame has arrived the state only flips online<->down on the frame timeout,
  // never back to 'connecting', so a restart can't make it flap.
  private evaluateHealth(): void {
    const now = Date.now();
    let health: StreamHealth;
    if (this.everFramed && now - this.lastFrameAt <= FFMPEG_TIMEOUT_FRAME_MS) {
      health = 'online';
    } else if (!this.everFramed && now - this.startedAt <= FFMPEG_TIMEOUT_FRAME_MS) {
      health = 'connecting';
    } else {
      health = 'down';
    }
    if (health !== this.health) {
      this.health = health;
      this.onHealth?.(health);
    }
  }

  private kill(): void {
    if (!this.ff) return;
    try {
      this.ff.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    this.ff = null;
  }
}
