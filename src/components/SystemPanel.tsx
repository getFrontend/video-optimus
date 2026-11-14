import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import UseAnimations from "react-useanimations";
import xSquare from "react-useanimations/lib/xSquare";
import cpu from "react-useanimations/lib/cpu";
import type { RuntimeInfo } from "../types";
import { Icon } from "./Icon";

const QUALITY_METRICS = ["ssim", "psnr"] as const;

export function SystemPanel({
  runtime,
  desktop,
  checkingRuntime,
  onOpenSetup,
}: {
  runtime: RuntimeInfo | null;
  desktop: boolean;
  checkingRuntime: boolean;
  onOpenSetup: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const detailsCloseRef = useRef<HTMLButtonElement>(null);
  const availableCount = runtime?.encoders.filter((encoder) => encoder.available).length ?? 0;
  const availableEncoders = runtime?.encoders.filter((encoder) => encoder.available) ?? [];
  const closeDetails = useCallback(() => {
    setDetailsOpen(false);
    window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!detailsOpen) return;

    detailsCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDetails();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDetails, detailsOpen]);

  return (
    <section className="system-panel">
      {!desktop ? (
        <div className="system-state state-muted">
          Відкрийте настільну версію застосунку
        </div>
      ) : checkingRuntime ? (
        <div className="system-state state-muted system-loading" role="status">
          <span className="loading-spinner" aria-hidden="true" />
          <span>Перевіряємо кодеки та FFmpeg…</span>
        </div>
      ) : runtime?.ready ? (
        <>
          <UseAnimations
            animation={cpu}
            className="system-check-cpu"
            interaction="hover-replay"
            size={28}
            render={(eventProps, animationProps) => (
              <button
                {...eventProps}
                ref={detailsTriggerRef}
                className="system-check-trigger"
                type="button"
                aria-haspopup="dialog"
                onClick={(event) => {
                  eventProps.onClick(event);
                  setDetailsOpen(true);
                }}
              >
                <span className="system-check-list">
                  <span className="system-check-row state-ready">
                    <span className="system-check-mark"><Icon name="check" size={16} /></span>
                    <span>FFmpeg підключено</span>
                  </span>
                  <span className={`system-check-row${runtime.qsvAvailable ? " state-ready" : " state-muted"}`}>
                    <span className={`system-check-mark${runtime.qsvAvailable ? "" : " is-muted"}`}>
                      <Icon name={runtime.qsvAvailable ? "check" : "info"} size={16} />
                    </span>
                    <span>
                      {runtime.qsvAvailable
                        ? "Апаратне прискорення QSV"
                        : "Апаратне прискорення QSV не виявлено"}
                    </span>
                  </span>
                </span>
                <span {...animationProps} aria-hidden="true" />
              </button>
            )}
          />
          {detailsOpen && createPortal(
            <section
              className="system-details-overlay"
              role="dialog"
              aria-labelledby="system-details-title"
            >
              <header className="system-details-overlay-header">
                <h2 id="system-details-title">Детальна інформація</h2>
                <button
                  ref={detailsCloseRef}
                  className="icon-button"
                  type="button"
                  aria-label="Закрити детальну інформацію"
                  onClick={closeDetails}
                >
                  <UseAnimations animation={xSquare} interaction="hover-replay" size={36} />
                </button>
              </header>
              <dl className="system-details-list">
                <div>
                  <dt>Версія FFmpeg</dt>
                  <dd className="system-details-raw">{runtime.ffmpegVersion ?? "Недоступна"}</dd>
                </div>
                <div>
                  <dt>CPU та логічні потоки</dt>
                  <dd className="system-cpu-value">
                    <UseAnimations
                      animation={cpu}
                      className="system-cpu-animation"
                      interaction="loop"
                      size={20}
                      aria-hidden="true"
                    />
                    <span>
                      {runtime.processorName
                        ? `${runtime.processorName} (${runtime.logicalProcessors})`
                        : runtime.logicalProcessors}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>FFmpeg</dt>
                  <dd className="system-details-raw">{runtime.ffmpegPath ?? "Шлях недоступний"}</dd>
                </div>
                <div>
                  <dt>FFprobe</dt>
                  <dd className="system-details-raw">{runtime.ffprobePath ?? "Шлях недоступний"}</dd>
                </div>
                <div>
                  <dt>Доступні кодери ({availableCount})</dt>
                  <dd>
                    {availableEncoders.length
                      ? (
                        <ul className="system-encoder-list">
                          {availableEncoders.map((encoder) => (
                            <li key={encoder.name}>
                              <Icon className="system-encoder-check" name="check" size={14} />
                              <span>{encoder.name}</span>
                              <small>
                                ({encoder.hardware ? "QSV-тест пройден" : "CPU-кодер доступен"})
                              </small>
                            </li>
                          ))}
                        </ul>
                      )
                      : "Не виявлено"}
                  </dd>
                </div>
                <div>
                  <dt>Фільтри оцінки якості</dt>
                  <dd>
                    <ul className="system-metric-list">
                      {QUALITY_METRICS.map((metric) => {
                        const available = runtime.qualityMetrics.includes(metric);
                        return (
                          <li
                            className={available ? "state-ready" : "state-muted"}
                            key={metric}
                          >
                            <Icon
                              name={available ? "check" : "info"}
                              size={15}
                            />
                            <span>{metric.toUpperCase()}</span>
                            <small>{available ? "Доступний" : "Недоступний"}</small>
                          </li>
                        );
                      })}
                    </ul>
                  </dd>
                </div>
              </dl>
            </section>,
            document.body,
          )}
        </>
      ) : (
        <>
        <div className="system-state state-warning">FFmpeg не знайдено</div>
          <p className="system-help">
          Підключіть <code>ffmpeg.exe</code> і <code>ffprobe.exe</code>, щоб почати обробку.
          </p>
          <button
            className="button button-quiet system-help-trigger"
            type="button"
            onClick={onOpenSetup}
          >
            <span className="system-help-icon">
              <Icon name="info" size={16} />
            </span>
            <span>Інструкція з налаштування</span>
          </button>
        </>
      )}
    </section>
  );
}
