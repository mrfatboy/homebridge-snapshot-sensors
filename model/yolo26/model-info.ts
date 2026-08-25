import { YOLO26_CLASSES } from './classes.js';

export const YOLO26_MODEL_INFO = {
  name: 'yolo26',
  classCount: YOLO26_CLASSES.length,
} as const;
