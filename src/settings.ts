export const PLATFORM_NAME = 'StreamSensors';
export const PLUGIN_NAME = 'homebridge-stream-sensors';

// Frame dimensions — must match yolo26n.onnx (non-dynamic [1,3,576,1024])
export const FRAME_WIDTH = 1024;
export const FRAME_HEIGHT = 576;

// Detection
export const SAMPLE_MS = 2_000;
export const THRESHOLD = 0.5;
export const THRESHOLD_KEEP = 0.05;
export const AREA_MIN_FRAC = 0.002;

// Sensor timing
export const COOLDOWN_MS = 3_000;
export const AUTO_OFF_MS = 9_000;

// ffmpeg emits raw frames on stdout at this rate; the loop samples the latest.
export const FFMPEG_FPS = Math.max(1, Math.min(10, Math.ceil(2_000 / SAMPLE_MS)));
export const FFMPEG_TIMEOUT_FRAME_MS = 10_000;
export const FFMPEG_TIMEOUT_RESTART_MS = 60_000;

// IR normalization
export const IR_GAMMA = 0.7;
export const IR_CLIP_LOW_PCT = 0.01;
export const IR_CLIP_HIGH_PCT = 0.99;
