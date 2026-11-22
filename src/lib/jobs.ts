import type { VideoJob } from "../types";

export function isSuccessfulJob(
  job: VideoJob,
): job is VideoJob & { outputPath: string } {
  return job.status === "completed" && Boolean(job.outputPath?.trim()) && !job.error;
}
