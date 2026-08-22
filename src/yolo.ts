import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import type { Detection, StoreSnapshots } from './types.js';

export interface YoloResult {
  detections: Detection[];
  annotatedImage?: Buffer;
}

interface NativeResult {
  detections: Detection[];
  annotated_path?: string;
}

function packageRoot(): string {
  // Compiled file: <package>/dist/src/yolo.js
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

function runnerPath(): string {
  const executable = process.platform === 'win32' ? 'snapshot-sensors-yolo.exe' : 'snapshot-sensors-yolo';
  return join(packageRoot(), 'native', 'yolo-runner', 'bin', executable);
}

function runNative(modelPath: string, imagePath: string, annotatedPath?: string): Promise<NativeResult> {
  return new Promise((resolve, reject) => {
    const args = [modelPath, imagePath];
    if (annotatedPath) args.push(annotatedPath);

    const child = spawn(runnerPath(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', error => reject(new Error(`Unable to start embedded YOLO runner: ${error.message}`)));
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(`Embedded YOLO runner failed (${code}): ${stderr.trim() || stdout.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as NativeResult);
      } catch (error) {
        reject(new Error(`Embedded YOLO runner returned invalid JSON: ${String(error)}`));
      }
    });
  });
}

export async function runYolo(image: Buffer, storeSnapshots: StoreSnapshots): Promise<YoloResult> {
  const modelPath = join(packageRoot(), 'model', 'yolo26', 'model.onnx');
  const workDir = await mkdtemp(join(tmpdir(), 'snapshot-sensors-yolo-'));
  const imagePath = join(workDir, 'input.jpg');
  const annotatedPath = storeSnapshots === 'annotated' ? join(workDir, 'annotated.jpg') : undefined;

  try {
    await writeFile(imagePath, image);
    const result = await runNative(modelPath, imagePath, annotatedPath);
    const annotatedImage = result.annotated_path ? await readFile(result.annotated_path) : undefined;
    return { detections: result.detections, annotatedImage };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
