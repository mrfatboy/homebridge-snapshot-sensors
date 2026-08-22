export const PLATFORM_NAME = 'SnapshotSensors';
export const PLUGIN_NAME = 'homebridge-snapshot-sensors';

// Snapshot analysis interval.
export const SAMPLE_MS = 2_000;

// Detection values are interpreted by the YOLO service; these constants are
// retained only for compatibility with the sensor-side category handling.
export const THRESHOLD = 0.5;
export const THRESHOLD_KEEP = 0.05;
export const AREA_MIN_FRAC = 0.002;

// YOLO input frame dimensions used for normalized detection-area filtering.
export const FRAME_WIDTH = 1024;
export const FRAME_HEIGHT = 576;
