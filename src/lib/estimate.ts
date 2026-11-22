import type {
  CompressionMode,
  CustomDevice,
  CustomPreset,
  CustomSettings,
  CustomVideoCodec,
  QualityProfile,
  VideoMetadata,
} from "../types";

type EstimateRange = {
  minBytes: number;
  maxBytes: number;
  basis: "bitrate" | "profile";
};

const QUALITY_RANGES: Record<QualityProfile, [number, number]> = {
  near_original: [0.6, 0.95],
  high: [0.35, 0.65],
  balanced: [0.15, 0.45],
  compact: [0.1, 0.28],
};

const MODE_RANGES: Record<CompressionMode, [number, number]> = {
  smart: [1, 1],
  fast: [1.1, 1.25],
  maximum: [0.8, 0.95],
  custom: [1, 1],
};

const CUSTOM_CODEC_RANGES: Record<CustomVideoCodec, [number, number]> = {
  h264: [1, 1],
  hevc: [0.78, 0.9],
  av1: [0.68, 0.84],
};

const CUSTOM_DEVICE_RANGES: Record<CustomDevice, [number, number]> = {
  auto: [1, 1.2],
  cpu: [0.95, 1.05],
  qsv: [1.08, 1.22],
};

const CUSTOM_PRESET_RANGES: Record<CustomPreset, [number, number]> = {
  fast: [1.05, 1.16],
  balanced: [0.97, 1.06],
  quality: [0.88, 1],
};

export function estimateOutputSize(
  sourceSize: number,
  metadata: VideoMetadata,
  mode: CompressionMode,
  quality: QualityProfile,
  customSettings?: CustomSettings,
): EstimateRange | null {
  if (mode === "custom") {
    return estimateCustomOutputSize(sourceSize, metadata, quality, customSettings);
  }

  const profileEstimate = estimateByProfile(sourceSize, mode, quality);
  const duration = metadata.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return profileEstimate;

  const audioBitrate = outputAudioBitrate(mode, metadata);
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

function estimateCustomOutputSize(
  sourceSize: number,
  metadata: VideoMetadata,
  quality: QualityProfile,
  settings?: CustomSettings,
): EstimateRange | null {
  const profileEstimate = estimateCustomByProfile(sourceSize, metadata, quality, settings);
  if (!settings) return profileEstimate;

  const duration = metadata.durationSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return profileEstimate;

  const sourceAudioBitrate = sourceAudioBitrateOrEstimate(metadata);
  const outputAudioBitrate = settings.audioCodec === "aac"
    ? metadata.audioTracks * settings.audioBitrateKbps * 1_000
    : sourceAudioBitrate;
  const manualVideoBitrate = settings.videoBitrateKbps;

  if (
    manualVideoBitrate != null &&
    Number.isFinite(manualVideoBitrate) &&
    manualVideoBitrate > 0
  ) {
    return estimateFromBitrates(
      manualVideoBitrate * 1_000,
      outputAudioBitrate,
      duration,
      [0.92, 1.08],
      audioBitrateFromSource(metadata) == null ? "profile" : "bitrate",
    );
  }

  const sourceVideoBitrate = estimateSourceVideoBitrate(
    sourceSize,
    metadata,
    sourceAudioBitrate,
    duration,
  );
  if (sourceVideoBitrate == null) return profileEstimate;

  const [qualityMin, qualityMax] = QUALITY_RANGES[quality];
  const [customMin, customMax] = customVideoFactors(settings);
  const hasMeasuredBitrates =
    metadata.videoBitrate != null && audioBitrateFromSource(metadata) != null;

  return estimateFromBitrates(
    sourceVideoBitrate,
    outputAudioBitrate,
    duration,
    [qualityMin * customMin, qualityMax * customMax],
    hasMeasuredBitrates ? "bitrate" : "profile",
  );
}

function estimateCustomByProfile(
  sourceSize: number,
  metadata: VideoMetadata,
  quality: QualityProfile,
  settings?: CustomSettings,
): EstimateRange | null {
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) return null;

  const [qualityMin, qualityMax] = QUALITY_RANGES[quality];
  const [customMin, customMax] = settings
    ? customVideoFactors(settings)
    : [1, 1];
  const duration = metadata.durationSeconds;

  if (!Number.isFinite(duration) || duration <= 0) {
    return {
      minBytes: Math.round(sourceSize * qualityMin * customMin),
      maxBytes: Math.round(sourceSize * qualityMax * customMax),
      basis: "profile",
    };
  }

  const sourceAudioBitrate = sourceAudioBitrateOrEstimate(metadata);
  const outputAudioBitrate = settings?.audioCodec === "aac"
    ? metadata.audioTracks * settings.audioBitrateKbps * 1_000
    : sourceAudioBitrate;
  const sourceAudioBytes = (sourceAudioBitrate * duration) / 8;
  const sourceVideoBytes = Math.max(0, sourceSize - sourceAudioBytes);
  const outputAudioBytes = (outputAudioBitrate * duration) / 8;

  return {
    minBytes: Math.round(
      (sourceVideoBytes * qualityMin * customMin + outputAudioBytes) * 1.02,
    ),
    maxBytes: Math.round(
      (sourceVideoBytes * qualityMax * customMax + outputAudioBytes) * 1.02,
    ),
    basis: "profile",
  };
}

function estimateSourceVideoBitrate(
  sourceSize: number,
  metadata: VideoMetadata,
  sourceAudioBitrate: number,
  duration: number,
): number | null {
  if (
    metadata.videoBitrate != null &&
    Number.isFinite(metadata.videoBitrate) &&
    metadata.videoBitrate > 0
  ) {
    return metadata.videoBitrate;
  }

  const totalBitrate = metadata.bitrate ?? (
    Number.isFinite(sourceSize) && sourceSize > 0
      ? (sourceSize * 8) / duration
      : null
  );
  if (totalBitrate == null || !Number.isFinite(totalBitrate)) return null;

  const videoBitrate = Math.max(0, totalBitrate - sourceAudioBitrate);
  return videoBitrate > 0 ? videoBitrate : null;
}

function customVideoFactors(settings: CustomSettings): [number, number] {
  const [codecMin, codecMax] = CUSTOM_CODEC_RANGES[settings.codec];
  const [deviceMin, deviceMax] = CUSTOM_DEVICE_RANGES[settings.device];
  const [presetMin, presetMax] = CUSTOM_PRESET_RANGES[settings.preset];
  return [
    codecMin * deviceMin * presetMin,
    codecMax * deviceMax * presetMax,
  ];
}

function estimateFromBitrates(
  videoBitrate: number,
  audioBitrate: number,
  duration: number,
  videoFactors: [number, number],
  basis: EstimateRange["basis"],
): EstimateRange {
  const [videoMinFactor, videoMaxFactor] = videoFactors;
  return {
    minBytes: Math.round(
      ((videoBitrate * videoMinFactor + audioBitrate) * duration / 8) * 1.02,
    ),
    maxBytes: Math.round(
      ((videoBitrate * videoMaxFactor + audioBitrate) * duration / 8) * 1.02,
    ),
    basis,
  };
}

function sourceAudioBitrateOrEstimate(metadata: VideoMetadata): number {
  return audioBitrateFromSource(metadata)
    ?? metadata.audioTracks * 192_000;
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

function outputAudioBitrate(mode: CompressionMode, metadata: VideoMetadata): number | null {
  if (mode !== "smart") {
    return audioBitrateFromSource(metadata);
  }
  const cap = metadata.audioTracks * 128_000;
  const source = audioBitrateFromSource(metadata);
  if (source == null) {
    return cap;
  }
  return Math.min(source, cap);
}
