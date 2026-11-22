import { useCallback, useEffect, useRef, useState } from "react";
import xSquare from "react-useanimations/lib/xSquare";
import type { VideoJob } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { formatDuration, formatSize } from "../lib/format";
import { useSynchronizedVideoPlayer } from "../hooks/useSynchronizedVideoPlayer";
import { AnimatedIcon } from "./AnimatedIcon";
import { ComparisonWipe } from "./ComparisonWipe";
import { Icon } from "./Icon";

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])';
const MODAL_CLOSE_DURATION = 150;

type ComparableVideoJob = VideoJob & { outputPath: string };

export function VideoComparisonDialog({
  job,
  onClose,
}: {
  job: ComparableVideoJob | null;
  onClose: () => void;
}) {
  const [displayedJob, setDisplayedJob] = useState(job);
  const [mounted, setMounted] = useState(Boolean(job));
  const [visible, setVisible] = useState(false);
  const [split, setSplit] = useState(50);
  const {
    sourceVideoRef,
    optimizedVideoRef,
    playing,
    muted,
    setMuted,
    currentTime,
    duration,
    error: mediaError,
    pause,
    reset,
    togglePlayback,
    seek,
    updateFromSource,
    loadSourceMetadata,
    setMediaError,
  } = useSynchronizedVideoPlayer();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (job) {
      setDisplayedJob(job);
      setSplit(50);
      reset();
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    if (!mounted) return;
    const timer = window.setTimeout(() => {
      setMounted(false);
      setDisplayedJob(null);
    }, MODAL_CLOSE_DURATION);
    return () => window.clearTimeout(timer);
  }, [job, mounted, reset]);

  useEffect(() => {
    if (!mounted) return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [mounted]);

  const closeDialog = useCallback(() => {
    pause();
    onCloseRef.current();
  }, [pause]);

  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, mounted]);

  if (!mounted || !displayedJob) return null;

  const savedBytes = (displayedJob.outputSize ?? 0) - displayedJob.sourceSize;
  const savedPercent = displayedJob.sourceSize > 0
    ? Math.round((savedBytes / displayedJob.sourceSize) * 100)
    : 0;
  const sourceUrl = convertFileSrc(displayedJob.path);
  const optimizedUrl = convertFileSrc(displayedJob.outputPath);
  const videoRatio = displayedJob.metadata.width > 0 && displayedJob.metadata.height > 0
    ? displayedJob.metadata.width / displayedJob.metadata.height
    : 16 / 9;
  const playerWidth = `min(100%, ${videoRatio * 62}dvh)`;
  const controlWidth = `min(100%, max(${videoRatio * 62}dvh, 22rem))`;

  return (
    <div
      className={`ffmpeg-dialog-backdrop video-comparison-backdrop ${visible ? "is-open" : "is-closing"}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <section
        ref={dialogRef}
        className={`ffmpeg-dialog t-modal video-comparison-dialog ${visible ? "is-open" : "is-closing"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-comparison-title"
      >
        <header className="ffmpeg-dialog-header video-comparison-header">
          <div className="video-comparison-title">
            <div>
              <span className="ffmpeg-dialog-eyebrow">ОРИГІНАЛ · ОПТИМІЗОВАНО · ПОРІВНЯННЯ 1:1</span>
              <h2 id="video-comparison-title">Побачте різницю</h2>
              <p className="video-comparison-filename" title={displayedJob.path}>
                {displayedJob.fileName}
              </p>
            </div>
          </div>
          <div className="video-comparison-header-end">
            {displayedJob.outputSize != null && (
              <span className={`video-comparison-savings${savedBytes >= 0 ? " is-saving" : " is-increase"}`}>
                <strong>{savedBytes >= 0 ? "−" : "+"}{Math.abs(savedPercent)}%</strong>
                <small>{formatSize(Math.abs(savedBytes))} {savedBytes >= 0 ? "заощаджено" : "різниця"}</small>
              </span>
            )}
            <button
              ref={closeButtonRef}
              className="icon-button video-comparison-close"
              type="button"
              aria-label="Закрити порівняння"
              onClick={closeDialog}
            >
              <AnimatedIcon animation={xSquare} interaction="hover-replay" size={54} />
            </button>
          </div>
        </header>

        <div className="ffmpeg-dialog-content video-comparison-content">
          <ComparisonWipe
            split={split}
            onSplit={setSplit}
            aspectRatio={videoRatio}
            width={playerWidth}
            overlay={!playing && !mediaError ? (
              <button
                className="comparison-center-play"
                type="button"
                data-player-interactive
                aria-label="Відтворити обидва відео"
                onClick={() => void togglePlayback()}
              >
                <Icon name="play" size={30} />
              </button>
            ) : mediaError ? (
              <div className="comparison-error" role="alert">{mediaError}</div>
            ) : null}
          >
            <video
              ref={sourceVideoRef}
              className="comparison-video"
              src={sourceUrl}
              preload="metadata"
              playsInline
              muted={muted}
              onLoadedMetadata={(event) => {
                loadSourceMetadata(event.currentTarget.duration);
              }}
              onTimeUpdate={(event) => {
                updateFromSource(event.currentTarget.currentTime);
              }}
              onEnded={pause}
              onError={() => setMediaError("оригінальне")}
              aria-label={`${displayedJob.fileName}, оригінал`}
            />
            <div
              className="comparison-optimized-reveal"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            >
              <video
                ref={optimizedVideoRef}
                className="comparison-video"
                src={optimizedUrl}
                preload="metadata"
                playsInline
                muted
                onError={() => setMediaError("оптимізоване")}
                aria-label={`${displayedJob.fileName}, оптимізоване`}
              />
            </div>
          </ComparisonWipe>

          <div
            className="comparison-controls"
            data-player-interactive
            style={{ width: controlWidth }}
          >
            <button
              className="comparison-play-button"
              type="button"
              aria-label={playing ? "Призупинити відео" : "Відтворити відео"}
              onClick={() => void togglePlayback()}
            >
              <Icon name={playing ? "pause" : "play"} size={22} />
            </button>
            <span className="comparison-time">{formatDuration(currentTime)}</span>
            <input
              className="comparison-timeline"
              type="range"
              min={0}
              max={Math.max(duration, 0)}
              step={0.01}
              value={Math.min(currentTime, duration || currentTime)}
              aria-label="Час відтворення"
              onChange={(event) => seek(Number(event.currentTarget.value))}
            />
            <span className="comparison-time">{formatDuration(duration)}</span>
            <button
              className={`comparison-sound-button${muted ? " is-muted" : ""}`}
              type="button"
              aria-label={muted ? "Увімкнути звук оригіналу" : "Вимкнути звук оригіналу"}
              onClick={() => setMuted((value) => !value)}
            >
              <Icon name={muted ? "volumeOff" : "volume"} size={18} />
              <span>{muted ? "ЗВУК ВИМКНЕНО" : "ЗВУК ОРИГІНАЛУ"}</span>
            </button>
          </div>

          <p className="comparison-hint" style={{ width: controlWidth }}>
            Перетягніть межу або скористайтеся клавішами зі стрілками, щоб порівняти деталі кадру.
          </p>
        </div>
      </section>
    </div>
  );
}
