import { invoke, isTauri } from "@tauri-apps/api/core";

const thumbnailCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string | null>>();
const MAX_CACHED_THUMBNAILS = 64;

export function getVideoThumbnail(jobId: string): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null);

  const cachedThumbnail = thumbnailCache.get(jobId);
  if (cachedThumbnail) {
    thumbnailCache.delete(jobId);
    thumbnailCache.set(jobId, cachedThumbnail);
    return Promise.resolve(cachedThumbnail);
  }

  const pendingRequest = pendingRequests.get(jobId);
  if (pendingRequest) return pendingRequest;

  const request = invoke<string | null>("get_video_thumbnail", { id: jobId })
    .then((thumbnail) => {
      if (thumbnail) {
        thumbnailCache.set(jobId, thumbnail);
        if (thumbnailCache.size > MAX_CACHED_THUMBNAILS) {
          const oldestJobId = thumbnailCache.keys().next().value;
          if (oldestJobId) thumbnailCache.delete(oldestJobId);
        }
      }
      return thumbnail;
    })
    .catch(() => null)
    .finally(() => {
      pendingRequests.delete(jobId);
    });

  pendingRequests.set(jobId, request);
  return request;
}

export function invalidateVideoThumbnail(jobId: string): void {
  thumbnailCache.delete(jobId);
}
