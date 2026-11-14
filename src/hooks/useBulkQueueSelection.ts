import { useCallback, useState } from "react";
import type { JobStatus, VideoJob } from "../types";

export const SELECTABLE_STATUSES: JobStatus[] = [
  "pending",
  "failed",
  "cancelled",
  "interrupted",
];
const RETRYABLE_STATUSES: JobStatus[] = ["failed", "cancelled", "interrupted"];

export function useBulkQueueSelection(
  jobs: VideoJob[],
  applySettings: (ids: string[]) => void,
  retryJobs: (ids: string[]) => void,
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedJobs = jobs.filter(
    (job) => SELECTABLE_STATUSES.includes(job.status) && selectedIds.has(job.id),
  );

  const selectJob = useCallback((id: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const applyToPending = useCallback(() => {
    const ids = selectedJobs
      .filter((job) => job.status === "pending")
      .map((job) => job.id);
    if (ids.length === 0) return;
    applySettings(ids);
    clear();
  }, [applySettings, clear, selectedJobs]);

  const retrySelected = useCallback(() => {
    const ids = selectedJobs
      .filter((job) => RETRYABLE_STATUSES.includes(job.status))
      .map((job) => job.id);
    if (ids.length === 0) return;
    retryJobs(ids);
    clear();
  }, [clear, retryJobs, selectedJobs]);

  return { selectedIds, selectedJobs, selectJob, clear, applyToPending, retrySelected };
}
