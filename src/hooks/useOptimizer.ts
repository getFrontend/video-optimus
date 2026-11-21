import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  AppSnapshot,
  CompressionMode,
  CustomSettings,
  EnqueueResult,
  PreviewResult,
  QualityProfile,
} from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  mode: "smart",
  quality: "balanced",
  outputDirectory: null,
  targetSizeBytes: null,
  customSettings: {
    codec: "h264",
    device: "auto",
    preset: "balanced",
    container: "auto",
    audioCodec: "copy",
    audioBitrateKbps: 192,
    videoBitrateKbps: null,
  },
};

export type NoticeType = "info" | "success" | "warning" | "error";
type Notice = { message: string; type: NoticeType };

export function useOptimizer() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [previewSettings, setPreviewSettings] = useState(DEFAULT_SETTINGS);
  const [desktop, setDesktop] = useState(false);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const snapshotRef = useRef(snapshot);
  const runtimeRefreshInFlight = useRef(false);
  const settings = snapshot?.settings ?? previewSettings;
  const settingsRef = useRef(settings);
  const noticeTimer = useRef<number | undefined>(undefined);
  const addingPaths = useRef(new Set<string>());
  snapshotRef.current = snapshot;
  settingsRef.current = settings;

  const showNotice = useCallback((message: string, type: NoticeType = "info") => {
    setNotice({ message, type });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4800);
  }, []);

  const refresh = useCallback(async () => {
    const next = await invoke<AppSnapshot>("get_snapshot");
    setSnapshot(next);
  }, []);

  const addPaths = useCallback(async (paths: string[]) => {
    const uniquePaths = paths.filter((path) => !addingPaths.current.has(path));
    if (uniquePaths.length === 0) return;
    uniquePaths.forEach((path) => addingPaths.current.add(path));
    try {
      const result = await invoke<EnqueueResult>("enqueue_files", {
        options: { paths: uniquePaths, ...settingsRef.current },
      });
      setSnapshot(await invoke<AppSnapshot>("get_snapshot"));
      if (result.rejected.length > 0) {
        const message = [
          result.added.length > 0 ? `Додано файлів: ${result.added.length}` : "",
          ...result.rejected.slice(0, 2),
        ].filter(Boolean).join("\n");
        showNotice(message, result.added.length > 0 ? "warning" : "error");
      } else if (result.added.length > 0) {
        showNotice(`Додано файлів: ${result.added.length}`, "success");
      }
    } catch (error) {
      showNotice(errorMessage(error), "error");
    } finally {
      uniquePaths.forEach((path) => addingPaths.current.delete(path));
    }
  }, [showNotice]);

  useEffect(() => {
    let disposed = false;
    let unlistenSnapshot: (() => void) | undefined;
    let unlistenDrop: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;

    async function connect() {
      const available = isTauri();
      setDesktop(available);
      setCheckingRuntime(available);
      if (!available) return;

      const stopSnapshot = await listen<AppSnapshot>("app-snapshot", (event) => {
        snapshotRef.current = event.payload;
        setSnapshot(event.payload);
      });
      if (disposed) {
        stopSnapshot();
        return;
      }
      unlistenSnapshot = stopSnapshot;
      const stopDrop = await getCurrentWindow().onDragDropEvent((event) => {
        if (event.payload.type === "over") setDragging(true);
        if (event.payload.type === "leave") setDragging(false);
        if (event.payload.type === "drop") {
          setDragging(false);
          void addPaths(event.payload.paths);
        }
      });
      if (disposed) {
        stopDrop();
        return;
      }
      unlistenDrop = stopDrop;
      const initial = await invoke<AppSnapshot>("initialize");
      if (disposed) return;
      snapshotRef.current = initial;
      setSnapshot(initial);
      setCheckingRuntime(false);

      const stopFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (
          !focused ||
          disposed ||
          runtimeRefreshInFlight.current ||
          snapshotRef.current?.runtime.ready !== false
        ) {
          return;
        }

        runtimeRefreshInFlight.current = true;
        setCheckingRuntime(true);
        void invoke<AppSnapshot>("refresh_runtime")
          .then((next) => {
            if (disposed) return;
            snapshotRef.current = next;
            setSnapshot(next);
          })
          .catch((error) => {
            if (!disposed) showNotice(errorMessage(error), "error");
          })
          .finally(() => {
            runtimeRefreshInFlight.current = false;
            if (!disposed) setCheckingRuntime(false);
          });
      });
      if (disposed) {
        stopFocus();
        return;
      }
      unlistenFocus = stopFocus;
    }

    void connect().catch((error) => {
      if (!disposed) {
        setCheckingRuntime(false);
        showNotice(errorMessage(error), "error");
      }
    });
    return () => {
      disposed = true;
      unlistenSnapshot?.();
      unlistenDrop?.();
      unlistenFocus?.();
    };
  }, [addPaths, showNotice]);

  const updateSettings = useCallback(async (next: AppSettings) => {
    if (!isTauri()) {
      setPreviewSettings(next);
      return;
    }

    try {
      await invoke("update_settings", { settings: next });
      setSnapshot((current) => current ? { ...current, settings: next } : current);
    } catch (error) {
      showNotice(errorMessage(error), "error");
    }
  }, [showNotice]);

  const chooseFiles = useCallback(async () => {
    const selection = await open({
      multiple: true,
      filters: [{
        name: "Відеофайли",
        extensions: ["mp4", "mkv", "mov", "avi", "webm", "m4v", "ts", "mpg", "mpeg"],
      }],
    });
    if (selection) await addPaths(Array.isArray(selection) ? selection : [selection]);
  }, [addPaths]);

  const chooseFolder = useCallback(async () => {
    const selection = await open({ directory: true, multiple: false });
    if (typeof selection !== "string") return;
    try {
      const result = await invoke<EnqueueResult>("enqueue_folder", {
        path: selection,
        settings,
      });
      setSnapshot(await invoke<AppSnapshot>("get_snapshot"));
      if (result.added.length > 0 || result.rejected.length > 0) {
        const message = [
          result.added.length > 0 ? `Додано з теки: ${result.added.length}` : "",
          ...result.rejected.slice(0, 2),
        ].filter(Boolean).join("\n");
        showNotice(
          message,
          result.rejected.length > 0
            ? result.added.length > 0 ? "warning" : "error"
            : "success",
        );
      } else {
        showNotice("У теці не знайдено відео підтримуваних форматів.", "info");
      }
    } catch (error) {
      showNotice(errorMessage(error), "error");
    }
  }, [settings, showNotice]);

  const chooseOutput = useCallback(async () => {
    const selection = await open({ directory: true, multiple: false });
    if (typeof selection === "string") {
      await updateSettings({ ...settings, outputDirectory: selection });
    }
  }, [settings, updateSettings]);

  const setMode = (mode: CompressionMode) => updateSettings({ ...settings, mode });
  const setQuality = (quality: QualityProfile) => updateSettings({ ...settings, quality });
  const setTargetSize = (targetSizeBytes: number | null) =>
    updateSettings({ ...settings, targetSizeBytes });
  const setCustomSettings = (customSettings: CustomSettings) =>
    updateSettings({ ...settings, customSettings });

  const command = useCallback(async (
    name: string,
    args?: Record<string, unknown>,
    success?: string,
  ): Promise<boolean> => {
    try {
      await invoke(name, args);
      await refresh();
      if (success) showNotice(success, "success");
      return true;
    } catch (error) {
      showNotice(errorMessage(error), "error");
      return false;
    }
  }, [refresh, showNotice]);

  const openPath = useCallback((path: string, reveal = false) => {
    void command("open_path", { path, reveal });
  }, [command]);

  const reorderJob = useCallback((id: string, targetIndex: number) => {
    void command("reorder_job", { id, targetIndex });
  }, [command]);

  const removeJob = useCallback((id: string) => {
    void command("remove_job", { id });
  }, [command]);

  const retryJob = useCallback((id: string) => {
    void command("retry_job", { id }, "Завдання додано для повторної обробки.");
  }, [command]);

  const createPreview = useCallback((id: string) => {
    return invoke<PreviewResult>("create_video_preview", { id });
  }, []);

  const removePreview = useCallback((previewId: string, jobId: string) => {
    return invoke("remove_video_preview", { previewId, jobId });
  }, []);

  const setJobSkipped = useCallback((id: string, skipped: boolean) => {
    void command("set_job_skipped", { id, skipped });
  }, [command]);

  const startQueue = useCallback(() => {
    void command("start_queue");
  }, [command]);

  const startSelectedJobs = useCallback((ids: string[]) => {
    return command(
      "start_selected_queue",
      { ids },
      "Вибрані відео додано для обробки.",
    );
  }, [command]);

  const stopQueue = useCallback(() => {
    void command("stop_queue");
  }, [command]);

  const cancelCurrent = useCallback(() => {
    void command("cancel_current");
  }, [command]);

  const removeQueuedJobs = useCallback((ids: string[] | null) => {
    const success = ids?.length
      ? "Вибрані відео вилучено з черги."
      : "Усі відео в очікуванні вилучено з черги.";
    return command("remove_queued_jobs", { ids }, success);
  }, [command]);

  const clearCompleted = useCallback(() => {
    void command("clear_completed");
  }, [command]);

  const dismissNotice = () => {
    window.clearTimeout(noticeTimer.current);
    setNotice(null);
  };

  return {
    snapshot,
    settings,
    desktop,
    dragging,
    notice,
    checkingRuntime,
    showNotice,
    dismissNotice,
    setMode,
    setQuality,
    setTargetSize,
    setCustomSettings,
    chooseFiles,
    chooseFolder,
    chooseOutput,
    addPaths,
    startQueue,
    startSelectedJobs,
    stopQueue,
    cancelCurrent,
    removeQueuedJobs,
    clearCompleted,
    reorderJob,
    removeJob,
    retryJob,
    createPreview,
    removePreview,
    setJobSkipped,
    openPath,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
