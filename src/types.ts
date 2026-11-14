export type CompressionMode = "smart" | "fast" | "maximum" | "custom";
export type QualityProfile = "near_original" | "high" | "balanced" | "compact";
export type CustomVideoCodec = "h264" | "hevc" | "av1";
export type CustomDevice = "auto" | "cpu" | "qsv";
export type CustomPreset = "fast" | "balanced" | "quality";
export type OutputContainer = "auto" | "mp4" | "mkv";
export type CustomAudioCodec = "copy" | "aac";
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
  videoBitrate: number | null;
  pixelFormat: string | null;
  bitDepth: number | null;
  colorSpace: string | null;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  colorRange: string | null;
  rotationDegrees: number | null;
  audioStreams: AudioStreamInfo[];
  subtitleStreams: SubtitleStreamInfo[];
  attachmentStreams: number;
  dataStreams: number;
  videoStreams: number;
  videoStreamIndex: number;
  attachedPictureStreams: number;
  unhandledStreams: number;
}

export interface AudioStreamInfo {
  codec: string;
  channels: number | null;
  channelLayout: string | null;
  sampleRate: number | null;
  language: string | null;
  bitrate: number | null;
}

export interface SubtitleStreamInfo {
  codec: string;
  language: string | null;
  title: string | null;
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
  customSettings: CustomSettings;
  encoder: string | null;
  error: string | null;
  createdAt: number;
  elapsedSeconds: number | null;
  targetSizeBytes: number | null;
  resultWarning: string | null;
  diagnosticLog: string | null;
}

export interface EncoderAvailability {
  name: string;
  available: boolean;
  hardware: boolean;
  supportedOptions: string[];
}

export interface RuntimeInfo {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  ffmpegVersion: string | null;
  encoders: EncoderAvailability[];
  qualityMetrics: string[];
  logicalProcessors: number;
  processorName: string | null;
  qsvAvailable: boolean;
  ready: boolean;
}

export interface AppSettings {
  mode: CompressionMode;
  quality: QualityProfile;
  outputDirectory: string | null;
  targetSizeBytes: number | null;
  customSettings: CustomSettings;
}

export interface CustomSettings {
  codec: CustomVideoCodec;
  device: CustomDevice;
  preset: CustomPreset;
  container: OutputContainer;
  audioCodec: CustomAudioCodec;
  audioBitrateKbps: number;
  videoBitrateKbps: number | null;
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

export interface PreviewClip {
  startSeconds: number;
  durationSeconds: number;
  optimizedPath: string;
  ssim: number | null;
  psnr: number | null;
}

export interface PreviewResult {
  previewId: string;
  jobId: string;
  clips: PreviewClip[];
}
