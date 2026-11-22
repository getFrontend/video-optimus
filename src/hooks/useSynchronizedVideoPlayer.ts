import { useCallback, useRef, useState } from "react";

export function useSynchronizedVideoPlayer() {
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const optimizedVideoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pause = useCallback(() => {
    sourceVideoRef.current?.pause();
    optimizedVideoRef.current?.pause();
    setPlaying(false);
  }, []);

  const reset = useCallback(() => {
    pause();
    setMuted(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [pause]);

  const togglePlayback = useCallback(async () => {
    const source = sourceVideoRef.current;
    const optimized = optimizedVideoRef.current;
    if (!source || !optimized) return;

    if (!source.paused || !optimized.paused) {
      pause();
      return;
    }

    try {
      await Promise.all([source.play(), optimized.play()]);
      setError(null);
      setPlaying(true);
    } catch {
      pause();
      setError("Не вдалося запустити відтворення обох відео.");
    }
  }, [pause]);

  const seek = useCallback((time: number) => {
    setCurrentTime(time);
    const source = sourceVideoRef.current;
    if (source && Math.abs(source.currentTime - time) > 0.04) {
      source.currentTime = time;
    }
    const optimized = optimizedVideoRef.current;
    if (!optimized) return;

    const target = Number.isFinite(optimized.duration)
      ? Math.min(time, optimized.duration)
      : time;
    if (Math.abs(optimized.currentTime - target) > 0.12) {
      optimized.currentTime = target;
    }
  }, []);

  const updateFromSource = useCallback((time: number) => {
    setCurrentTime(time);
    const optimized = optimizedVideoRef.current;
    if (optimized && Math.abs(optimized.currentTime - time) > 0.18) {
      optimized.currentTime = Math.min(time, optimized.duration || time);
    }
  }, []);

  const loadSourceMetadata = useCallback((nextDuration: number) => {
    if (Number.isFinite(nextDuration)) setDuration(nextDuration);
  }, []);

  const setMediaError = useCallback((label: "оригінальне" | "оптимізоване") => {
    setError(`Не вдалося відкрити ${label} відео.`);
  }, []);

  return {
    sourceVideoRef,
    optimizedVideoRef,
    playing,
    muted,
    setMuted,
    currentTime,
    duration,
    error,
    pause,
    reset,
    togglePlayback,
    seek,
    updateFromSource,
    loadSourceMetadata,
    setMediaError,
  };
}
