import { invoke, isTauri } from "@tauri-apps/api/core";

const thumbnailRequests = new Map<string, Promise<string | null>>();

export function getVideoThumbnail(jobId: string): Promise<string | null> {
  if (!isTauri()) return Promise.resolve(null);

  const cachedRequest = thumbnailRequests.get(jobId);
  if (cachedRequest) return cachedRequest;

  const request = invoke<string | null>("get_video_thumbnail", { id: jobId })
    .catch(() => null);

  thumbnailRequests.set(jobId, request);
  return request;
}
