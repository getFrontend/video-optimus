import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useComparisonMediaAccess(jobId: string | null) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
    setError(null);
    if (!jobId) return;

    let cancelled = false;
    invoke("allow_comparison_media", { jobId })
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return { ready, error };
}
