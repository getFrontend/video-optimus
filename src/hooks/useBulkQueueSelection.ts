import { useCallback, useState } from "react";
import type { JobStatus, VideoJob } from "../types";

export const SELECTABLE_STATUSES: JobStatus[] = [
  "pending",
  "failed",
  "cancelled",
  "interrupted",
];

export function useBulkQueueSelection(
  jobs: VideoJob[],
  startSelectedJobs: (ids: string[]) => Promise<boolean>,
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
  const startSelected = useCallback(async () => {
    const ids = selectedJobs.map((job) => job.id);
    if (ids.length === 0) return;
    if (await startSelectedJobs(ids)) clear();
  }, [clear, selectedJobs, startSelectedJobs]);

  return {
    selectedIds,
    selectedJobs,
    selectJob,
    clear,
    startSelected,
  };
}
