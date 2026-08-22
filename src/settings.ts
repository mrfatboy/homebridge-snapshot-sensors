export const PLATFORM_NAME = 'SnapshotSensors';
export const PLUGIN_NAME = 'homebridge-snapshot-sensors';

// Analyze one frame at most every two seconds per stream.
export const SAMPLE_MS = 2_000;

export const THRESHOLD = 0.5;
export const THRESHOLD_KEEP = 0.05;
export const AREA_MIN_FRAC = 0.002;

export const FRAME_WIDTH = 1024;
export const FRAME_HEIGHT = 576;

// Decode the camera stream at a low frame rate and retain only the newest frame.
export const FFMPEG_FPS = 2;
export const FFMPEG_TIMEOUT_FRAME_MS = 10_000;
export const FFMPEG_TIMEOUT_RESTART_MS = 2_000;
