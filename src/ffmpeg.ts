import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import { FRAME_WIDTH, FRAME_HEIGHT, FFMPEG_FPS, FFMPEG_TIMEOUT_FRAME_MS, FFMPEG_TIMEOUT_RESTART_MS } from './settings.js';
import type { StreamHealth } from './types.js';

const require = createRequire(import.meta.url);
const _ffmpegPath: string | null = require('ffmpeg-static') as string | null;
if (!_ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary for this platform');
const ffmpegBin: string = _ffmpegPath;

export interface PumpLog { info(msg: string): void; warn(msg: string): void; }

function findJpeg(buf: Buffer): { frame: Buffer | null; rest: Buffer } {
  const start = buf.indexOf(Buffer.from([0xff, 0xd8]));
  if (start < 0) return { frame: null, rest: buf.subarray(Math.max(0, buf.length - 1)) };
  const end = buf.indexOf(Buffer.from([0xff, 0xd9]), start + 2);
  if (end < 0) return { frame: null, rest: start > 0 ? buf.subarray(start) : buf };
  return { frame: Buffer.from(buf.subarray(start, end + 2)), rest: Buffer.from(buf.subarray(end + 2)) };
}

const FFMPEG_ARGS = (url: string): string[] => [
  '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', url, '-an',
  '-vf', `fps=${FFMPEG_FPS},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`,
  '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', 'pipe:1',
];

export function classifyFfmpegError(stderr: string): string | null {
  const s = stderr.toLowerCase();
  if (/401|unauthorized|authentication|auth.*fail|\b403\b|forbidden/.test(s)) return 'authentication failed — check the username/password in the stream URL';
  if (/connection refused|no route to host|network is unreachable|connection timed out|timed out|etimedout|ehostunreach|econnrefused|name or service not known/.test(s)) return 'camera unreachable — check the host/port and that the camera is reachable from the Homebridge host';
  if (/\b404\b|not found|no such file/.test(s)) return 'stream path not found — check the URL path/channel';
  if (/invalid data|could not find codec|codec parameters|does not contain any stream|decoder|unknown encoder|unsupported|protocol not found/.test(s)) return 'could not decode the stream — verify the URL path and that ffmpeg supports the codec/transport';
  return null;
}

export class FfmpegPump {
  private ff: ChildProcess | null = null;
  private restarting: number | null = null;
  private latestFrame: Buffer | null = null;
  private latestFrameDate = 0;
  private gotFrame = false;
  private everFramed = false;
  private lastFrameAt = 0;
  private startedAt = 0;
  private health: StreamHealth = 'connecting';
  private stderrTail = '';
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private readonly url: string, private readonly name: string, private readonly log: PumpLog, private readonly onHealth?: (health: StreamHealth) => void) {}

  start(): void { this.startedAt = Date.now(); this.startProcess(); this.watchdogTimer = setInterval(() => this.watchdog(), 500); }
  stop(): void { this.stopped = true; if (this.watchdogTimer !== null) clearInterval(this.watchdogTimer); this.kill(); }
  takeFrame(): Buffer | null { const frame = this.latestFrame; this.latestFrame = null; return frame; }

  private startProcess(): void {
    if (this.stopped) return;
    this.gotFrame = false; this.stderrTail = '';
    const child = spawn(ffmpegBin, FFMPEG_ARGS(this.url), { stdio: ['ignore', 'pipe', 'pipe'] });
    this.ff = child; this.latestFrameDate = Date.now();
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => { if (child === this.ff) this.stderrTail = (this.stderrTail + chunk).slice(-1024); });
    let buf: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    child.stdout!.on('data', (chunk: Buffer) => {
      if (child !== this.ff) return;
      this.restarting = null; this.latestFrameDate = Date.now(); buf = Buffer.concat([buf, chunk]);
      while (true) {
        const parsed = findJpeg(buf); buf = parsed.rest;
        if (!parsed.frame) break;
        this.latestFrame = parsed.frame; this.lastFrameAt = Date.now(); this.everFramed = true;
        if (!this.gotFrame) { this.gotFrame = true; this.log.info(`Receiving frames from ${this.name}`); }
      }
    });
    child.on('error', err => { if (child === this.ff) this.restart(`spawn error: ${err.message}`); });
    child.on('close', (code, signal) => { if (child === this.ff) this.restart(`exited (code=${code}, signal=${signal})`); });
  }

  private restart(reason: string): void {
    if (this.stopped || this.restarting !== null) return;
    const detail = this.stderrTail.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
    const hint = classifyFfmpegError(this.stderrTail);
    this.log.warn(`Restarting ffmpeg: ${(detail ? `${reason}: ${detail}` : reason) + (hint ? ` — ${hint}` : '')}`);
    this.restarting = Date.now(); this.kill(); this.startProcess();
  }

  private watchdog(): void {
    if (this.stopped) return;
    this.evaluateHealth(); if (!this.ff) return;
    const stale = Date.now() - this.latestFrameDate > FFMPEG_TIMEOUT_FRAME_MS;
    const pastCooldown = this.restarting === null || Date.now() - this.restarting > FFMPEG_TIMEOUT_RESTART_MS;
    if (stale && pastCooldown) { this.restarting = null; this.restart('watchdog timeout (no frames — check the stream URL/credentials and that the stream is reachable)'); }
  }

  private evaluateHealth(): void {
    const now = Date.now();
    const health: StreamHealth = this.everFramed && now - this.lastFrameAt <= FFMPEG_TIMEOUT_FRAME_MS ? 'online' : !this.everFramed && now - this.startedAt <= FFMPEG_TIMEOUT_FRAME_MS ? 'connecting' : 'down';
    if (health !== this.health) { this.health = health; this.onHealth?.(health); }
  }

  private kill(): void { if (!this.ff) return; try { this.ff.kill('SIGKILL'); } catch { /* already gone */ } this.ff = null; }
}
