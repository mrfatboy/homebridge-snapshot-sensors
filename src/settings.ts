export const PLATFORM_NAME = 'SnapshotSensors';
export const PLUGIN_NAME = 'homebridge-snapshot-sensors';

// Snapshot analysis interval.
export const SAMPLE_MS = 2_000;

// Detection values are interpreted by the YOLO service; these constants are
// retained only for compatibility with the sensor-side category handling.
export const THRESHOLD = 0.5;
export const THRESHOLD_KEEP = 0.05;
export const AREA_MIN_FRAC = 0.002;
