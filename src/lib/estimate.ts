import type { CompressionMode, QualityProfile } from "../types";

type EstimateRange = {
  minBytes: number;
  maxBytes: number;
};

const QUALITY_RANGES: Record<QualityProfile, [number, number]> = {
  near_original: [0.8, 1.15],
  high: [0.55, 0.9],
  balanced: [0.4, 0.75],
  compact: [0.28, 0.6],
};

const MODE_ADJUSTMENTS: Record<CompressionMode, number> = {
  smart: 0,
  fast: 0.08,
  maximum: -0.06,
  custom: 0,
};

export function estimateOutputSize(
  sourceSize: number,
  mode: CompressionMode,
  quality: QualityProfile,
): EstimateRange | null {
  if (!Number.isFinite(sourceSize) || sourceSize <= 0) return null;

  const [minRatio, maxRatio] = QUALITY_RANGES[quality];
  const adjustment = MODE_ADJUSTMENTS[mode];

  return {
    minBytes: Math.round(sourceSize * Math.max(0.1, minRatio + adjustment)),
    maxBytes: Math.round(sourceSize * (maxRatio + adjustment)),
  };
}
