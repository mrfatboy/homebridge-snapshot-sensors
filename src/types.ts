export type Category = 'animal' | 'package' | 'person' | 'vehicle';

export interface StreamConfig {
  name: string;
  url: string;
  sensors: Category[][];
}

export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
}
