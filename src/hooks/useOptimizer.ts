import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  AppSnapshot,
  CompressionMode,
  EnqueueResult,
  QualityProfile,
} from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  mode: "smart",
  quality: "balanced",
  outputDirectory: null,
};

export function useOptimizer() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const snapshotRef = useRef(snapshot);
  const runtimeRefreshInFlight = useRef(false);
  const settings = snapshot?.settings ?? DEFAULT_SETTINGS;
  const settingsRef = useRef(settings);
  const noticeTimer = useRef<number | undefined>(undefined);
  const addingPaths = useRef(new Set<string>());
  snapshotRef.current = snapshot;
  settingsRef.current = settings;

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 4800);
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
      if (result.added.length > 0) {
        showNotice(`Додано файлів: ${result.added.length}`);
      }
      if (result.rejected.length > 0) {
        showNotice(result.rejected.slice(0, 2).join("\n"));
      }
    } catch (error) {
      showNotice(errorMessage(error));
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
            if (!disposed) showNotice(errorMessage(error));
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

    void connect().catch((error) => showNotice(errorMessage(error)));
    return () => {
      disposed = true;
      unlistenSnapshot?.();
      unlistenDrop?.();
      unlistenFocus?.();
    };
  }, [addPaths, showNotice]);

  const updateSettings = useCallback(async (next: AppSettings) => {
    try {
      await invoke("update_settings", { settings: next });
      setSnapshot((current) => current ? { ...current, settings: next } : current);
    } catch (error) {
      showNotice(errorMessage(error));
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
        mode: settings.mode,
        quality: settings.quality,
        outputDirectory: settings.outputDirectory,
      });
      setSnapshot(await invoke<AppSnapshot>("get_snapshot"));
      showNotice(result.added.length
        ? `Додано з теки: ${result.added.length}`
        : result.rejected[0] ?? "У теці не знайдено відео підтримуваних форматів.");
    } catch (error) {
      showNotice(errorMessage(error));
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

  const command = useCallback(async (
    name: string,
    args?: Record<string, unknown>,
    success?: string,
  ) => {
    try {
      await invoke(name, args);
      await refresh();
      if (success) showNotice(success);
    } catch (error) {
      showNotice(errorMessage(error));
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

  const skipJob = useCallback((id: string) => {
    void command("skip_job", { id });
  }, [command]);

  const startQueue = useCallback(() => {
    void command("start_queue");
  }, [command]);

  const stopQueue = useCallback(() => {
    void command("stop_queue");
  }, [command]);

  const cancelCurrent = useCallback(() => {
    void command("cancel_current");
  }, [command]);

  const cancelPending = useCallback(() => {
    void command("cancel_pending", undefined, "Очікувані завдання скасовано.");
  }, [command]);

  const clearCompleted = useCallback(() => {
    void command("clear_completed");
  }, [command]);

  const dismissNotice = () => {
    window.clearTimeout(noticeTimer.current);
    setNotice("");
  };

  return {
    snapshot,
    settings,
    desktop,
    dragging,
    notice,
    checkingRuntime,
    dismissNotice,
    setMode,
    setQuality,
    chooseFiles,
    chooseFolder,
    chooseOutput,
    addPaths,
    startQueue,
    stopQueue,
    cancelCurrent,
    cancelPending,
    clearCompleted,
    reorderJob,
    removeJob,
    retryJob,
    skipJob,
    openPath,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
