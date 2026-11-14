import { useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PreviewResult, VideoJob } from "../types";
import { formatDuration } from "../lib/format";
import { Icon } from "./Icon";

const FOCUSABLE_SELECTOR =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex="-1"])';

export function PreviewComparator({
  job,
  preview,
  loading,
  error,
  onClose,
}: {
  job: VideoJob;
  preview: PreviewResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sourceUrl = convertFileSrc(job.path);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
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
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="preview-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-dialog-title"
      >
        <header className="preview-dialog-header">
          <div>
            <span className="preview-eyebrow">ПЕРЕВІРКА НАЛАШТУВАНЬ</span>
            <h2 id="preview-dialog-title">Попереднє порівняння</h2>
            <p title={job.path}>{job.fileName}</p>
          </div>
          <button
            ref={closeRef}
            className="icon-button"
            type="button"
            aria-label="Закрити попередній перегляд"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="preview-dialog-content">
          <p className="preview-note">
            Короткі фрагменти з різних частин відео. Перевірте дрібний текст і рух у масштабі 100%.
          </p>
          {loading ? (
            <div className="preview-state" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <span>Створюємо короткі фрагменти для порівняння…</span>
            </div>
          ) : error ? (
            <div className="preview-state is-error" role="alert">{error}</div>
          ) : (
            <div className="preview-fragments">
              {preview?.clips.map((clip, index) => (
                <article className="preview-fragment" key={clip.optimizedPath}>
                  <h3>Фрагмент {index + 1} · {formatDuration(clip.startSeconds)}</h3>
                  <div className="preview-video-pair">
                    <div className="preview-video-column">
                      <span>Оригінал</span>
                      <video
                        className="preview-video"
                        controls
                        preload="metadata"
                        src={sourceUrl}
                        aria-label={`${job.fileName}, оригінал`}
                        onLoadedMetadata={(event) => {
                          event.currentTarget.currentTime = clip.startSeconds;
                        }}
                        onTimeUpdate={(event) => {
                          const video = event.currentTarget;
                          if (video.currentTime > clip.startSeconds + clip.durationSeconds) {
                            video.pause();
                            video.currentTime = clip.startSeconds + clip.durationSeconds;
                          }
                        }}
                      />
                    </div>
                    <div className="preview-video-column">
                      <span>Стиснене</span>
                      <video
                        className="preview-video"
                        controls
                        preload="metadata"
                        src={convertFileSrc(clip.optimizedPath)}
                        aria-label={`${job.fileName}, стиснений фрагмент ${index + 1}`}
                      />
                    </div>
                  </div>
                  {(clip.ssim != null || clip.psnr != null) && (
                    <p className="preview-metrics">
                      {clip.ssim != null && <span>SSIM {clip.ssim.toFixed(4)}</span>}
                      {clip.psnr != null && <span>PSNR {clip.psnr.toFixed(1)} dB</span>}
                      <small>Метрики допоміжні, не замінюють візуальну перевірку.</small>
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
