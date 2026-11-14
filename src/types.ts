export type CompressionMode = "smart" | "fast" | "maximum" | "custom";
export type QualityProfile = "near_original" | "high" | "balanced" | "compact";
export type JobStatus =
  | "pending"
  | "analyzing"
  | "preparing"
  | "encoding"
  | "validating"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "interrupted";

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  frameRate: string;
  codec: string;
  bitrate: number | null;
  isVfr: boolean;
  isHdr: boolean;
  audioTracks: number;
  subtitleTracks: number;
}

export interface VideoJob {
  id: string;
  path: string;
  fileName: string;
  sourceSize: number;
  metadata: VideoMetadata;
  status: JobStatus;
  progress: number;
  speed: string | null;
  etaSeconds: number | null;
  outputPath: string | null;
  outputSize: number | null;
  outputDirectory: string | null;
  mode: CompressionMode;
  quality: QualityProfile;
  encoder: string | null;
  error: string | null;
  createdAt: number;
  elapsedSeconds: number | null;
}

export interface EncoderAvailability {
  name: string;
  available: boolean;
  hardware: boolean;
}

export interface RuntimeInfo {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  ffmpegVersion: string | null;
  encoders: EncoderAvailability[];
  qsvAvailable: boolean;
  ready: boolean;
}

export interface AppSettings {
  mode: CompressionMode;
  quality: QualityProfile;
  outputDirectory: string | null;
}

export interface AppSnapshot {
  jobs: VideoJob[];
  runtime: RuntimeInfo;
  queueRunning: boolean;
  queuePaused: boolean;
  totalSavedBytes: number;
  settings: AppSettings;
}

export interface EnqueueResult {
  added: VideoJob[];
  rejected: string[];
}
