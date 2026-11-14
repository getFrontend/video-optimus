import { useCallback, useRef, useState } from "react";
import type { PreviewResult, VideoJob } from "../types";

type CreatePreview = (id: string) => Promise<PreviewResult>;
type RemovePreview = (previewId: string, jobId: string) => Promise<unknown>;

export function usePreviewComparison(
  jobs: VideoJob[],
  createPreview: CreatePreview,
  removePreview: RemovePreview,
) {
  const [job, setJob] = useState<VideoJob | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const open = useCallback(async (id: string) => {
    const selectedJob = jobs.find((item) => item.id === id);
    if (!selectedJob) return;

    const currentRequest = ++requestId.current;
    setJob(selectedJob);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const next = await createPreview(id);
      if (currentRequest !== requestId.current) {
        void removePreview(next.previewId, next.jobId);
        return;
      }
      setResult(next);
    } catch (reason) {
      if (currentRequest === requestId.current) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [createPreview, jobs, removePreview]);

  const close = useCallback(() => {
    requestId.current += 1;
    const current = result;
    const currentJob = job;
    setJob(null);
    setResult(null);
    setError(null);
    setLoading(false);
    if (current && currentJob) {
      window.requestAnimationFrame(() => {
        void removePreview(current.previewId, currentJob.id);
      });
    }
  }, [job, removePreview, result]);

  return { job, result, error, loading, open, close };
}
