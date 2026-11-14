import type {
  CompressionMode,
  CustomSettings,
  QualityProfile,
  VideoMetadata,
} from "../types";

type EstimateRange = {
  minBytes: number;
  maxBytes: number;
  basis: "bitrate" | "profile";
};

const QUALITY_RANGES: Record<QualityProfile, [number, number]> = {
  near_original: [0.75, 1.15],
  high: [0.55, 0.9],
  balanced: [0.4, 0.75],
  compact: [0.25, 0.55],
};

const MODE_RANGES: Record<CompressionMode, [number, number]> = {
  smart: [1, 1],
  fast: [1.1, 1.25],
  maximum: [0.8, 0.95],
  custom: [1, 1],
};

export function estimateOutputSize(
  sourceSize: number,
  metadata: VideoMetadata,
  mode: CompressionMode,
  quality: QualityProfile,
  customSettings?: CustomSettings,
): EstimateRange | null {
  const profileEstimate = estimateByProfile(sourceSize, mode, quality);
  const duration = metadata.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return profileEstimate;

  if (mode === "custom") {
    const manualSettings = customSettings;
    const videoBitrate = manualSettings?.videoBitrateKbps;
    if (manualSettings == null || videoBitrate == null || !Number.isFinite(videoBitrate) || videoBitrate <= 0) {
      return profileEstimate;
    }
    const audioBitrate = manualSettings.audioCodec === "aac"
      ? metadata.audioTracks * manualSettings.audioBitrateKbps * 1_000
      : audioBitrateFromSource(metadata);
    if (audioBitrate == null) return profileEstimate;

    const estimatedBytes =
      ((videoBitrate * 1_000 + audioBitrate) * duration / 8) * 1.02;
    return {
      minBytes: Math.round(estimatedBytes * 0.92),
      maxBytes: Math.round(estimatedBytes * 1.08),
      basis: "bitrate",
    };
  }

  const audioBitrate = audioBitrateFromSource(metadata);
  if (audioBitrate == null) return profileEstimate;
  const videoBitrate = metadata.videoBitrate ?? (
    metadata.bitrate == null ? null : Math.max(0, metadata.bitrate - audioBitrate)
  );
  if (videoBitrate == null || !Number.isFinite(videoBitrate) || videoBitrate <= 0) {
    return profileEstimate;
  }

  const [qualityMin, qualityMax] = QUALITY_RANGES[quality];
  const [modeMin, modeMax] = MODE_RANGES[mode];
  const audioBytes = (audioBitrate * duration) / 8;
  const containerOverhead = 1.02;
  return {
    minBytes: Math.round(
      ((videoBitrate * qualityMin * modeMin * duration) / 8 + audioBytes) *
        containerOverhead,
    ),
    maxBytes: Math.round(
      ((videoBitrate * qualityMax * modeMax * duration) / 8 + audioBytes) *
        containerOverhead,
    ),
    basis: "bitrate",
  };
}

function estimateByProfile(
  sourceSize: number,
  mode: CompressionMode,
  quality: QualityProfile,
): EstimateRange | null {
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) return null;

  const [qualityMin, qualityMax] = QUALITY_RANGES[quality];
  const [modeMin, modeMax] = MODE_RANGES[mode];
  return {
    minBytes: Math.round(sourceSize * qualityMin * modeMin),
    maxBytes: Math.round(sourceSize * qualityMax * modeMax),
    basis: "profile",
  };
}

function audioBitrateFromSource(metadata: VideoMetadata): number | null {
  const audioBitrates = metadata.audioStreams.map((stream) => stream.bitrate);
  if (metadata.audioTracks > 0 && (
    audioBitrates.length !== metadata.audioTracks ||
    audioBitrates.some((bitrate) => bitrate == null)
  )) {
    return null;
  }
  return audioBitrates.reduce<number>((total, bitrate) => total + (bitrate ?? 0), 0);
}
