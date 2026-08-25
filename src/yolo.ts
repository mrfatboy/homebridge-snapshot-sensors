import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { createInterface, Interface } from 'readline';
import type { Detection, StoreSnapshots } from './types.js';

export interface YoloResult {
  detections: Detection[];
  annotatedImage?: Buffer;
}

interface NativeResult {
  detections: Detection[];
  annotated_path?: string;
}

interface PendingRequest {
  resolve: (result: NativeResult) => void;
  reject: (error: Error) => void;
}

function packageRoot(): string {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

function runnerPath(): string {
  const executable = process.platform === 'win32' ? 'snapshot-sensors-yolo.exe' : 'snapshot-sensors-yolo';
  return join(packageRoot(), 'native', 'yolo-runner', 'bin', executable);
}

class YoloWorker {
  private child?: ChildProcessWithoutNullStreams;
  private output?: Interface;
  private pending?: PendingRequest;
  private ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private startupError?: Error;
  private onReady?: () => void;

  constructor(onReady?: () => void) {
    this.onReady = onReady;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.start();
  }

  private start(): void {
    const modelPath = join(packageRoot(), 'model', 'yolo26', 'model.onnx');
    this.child = spawn(runnerPath(), [modelPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.output = createInterface({ input: this.child.stdout });

    this.output.on('line', line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed === 'READY') {
        this.readyResolve();
        this.onReady?.();
        return;
      }
      if (!this.pending) return;
      const pending = this.pending;
      this.pending = undefined;
      try {
        pending.resolve(JSON.parse(trimmed) as NativeResult);
      } catch (error) {
        pending.reject(new Error(`Embedded YOLO runner returned invalid JSON: ${String(error)}`));
      }
    });

    this.child.once('error', error => {
      this.startupError = new Error(`Unable to start embedded YOLO runner: ${error.message}`);
      this.readyReject(this.startupError);
      this.rejectPending(this.startupError);
    });

    this.child.once('close', code => {
      const error = new Error(`Embedded YOLO runner stopped unexpectedly (${code ?? 'unknown'})`);
      this.rejectPending(error);
      if (!this.startupError) {
        this.startupError = error;
        this.readyReject(error);
      }
    });
  }

  private rejectPending(error: Error): void {
    if (this.pending) {
      const pending = this.pending;
      this.pending = undefined;
      pending.reject(error);
    }
  }

  async run(imagePath: string, annotatedPath?: string): Promise<NativeResult> {
    await this.ready;
    if (this.startupError || !this.child?.stdin.writable) {
      throw this.startupError ?? new Error('Embedded YOLO runner is not available');
    }
    if (this.pending) throw new Error('Embedded YOLO runner received a concurrent request');
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      const request = JSON.stringify({ image: imagePath, annotated: annotatedPath });
      this.child!.stdin.write(`${request}\n`, error => {
        if (error) {
          this.pending = undefined;
          reject(new Error(`Unable to send request to embedded YOLO runner: ${error.message}`));
        }
      });
    });
  }
}

// Start the native worker as soon as the plugin module is loaded so the model is
// loaded during Homebridge startup rather than on the first detection.
const yoloWorker = new YoloWorker(() => {
  console.log('[SnapshotSensors] YOLO26 model loaded and ready.');
});

export async function runYolo(image: Buffer, storeSnapshots: StoreSnapshots): Promise<YoloResult> {
  const workDir = await mkdtemp(join(tmpdir(), 'snapshot-sensors-yolo-'));
  const imagePath = join(workDir, 'input.jpg');
  const annotatedPath = storeSnapshots === 'annotated' ? join(workDir, 'annotated.jpg') : undefined;
  try {
    await writeFile(imagePath, image);
    const result = await yoloWorker.run(imagePath, annotatedPath);
    const annotatedImage = result.annotated_path ? await readFile(result.annotated_path) : undefined;
    return { detections: result.detections, annotatedImage };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
