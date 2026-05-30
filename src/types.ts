export interface StreamConfig {
  id: string;
  name: string;
  url: string;
  pollInterval?: number;
}

export interface StreamStatus {
  online: boolean;
  bitrate?: number;
  viewers?: number;
}
