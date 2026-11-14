import type { RuntimeInfo } from "../types";
import { Icon } from "./Icon";

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
  const availableCount = runtime?.encoders.filter((encoder) => encoder.available).length ?? 0;
  const availableEncoders = runtime?.encoders.filter((encoder) => encoder.available) ?? [];

  return (
    <section className="system-panel">
      <div className="system-heading">
        <Icon name="cpu" size={20} />
        <div>
          <h3>Система кодування</h3>
        </div>
      </div>
      {!desktop ? (
        <div className="system-state state-muted">
          Відкрийте настільну версію застосунку
        </div>
      ) : checkingRuntime ? (
        <div className="system-state state-muted">Перевіряємо підключення FFmpeg…</div>
      ) : runtime?.ready ? (
        <>
          <div className="system-check-list">
            <div className="system-check-row state-ready">
              <span className="system-check-mark"><Icon name="check" size={16} /></span>
              <span>FFmpeg підключено</span>
            </div>
            <div className={`system-check-row${runtime.qsvAvailable ? " state-ready" : " state-muted"}`}>
              <span className={`system-check-mark${runtime.qsvAvailable ? "" : " is-muted"}`}>
                <Icon name={runtime.qsvAvailable ? "check" : "info"} size={16} />
              </span>
              <span>
                {runtime.qsvAvailable
                  ? "Апаратне прискорення QSV доступне"
                  : "Апаратне прискорення QSV не виявлено"}
              </span>
            </div>
          </div>
          <details className="system-details">
            <summary>
              <span>Детальна інформація</span>
              <Icon className="system-details-chevron" name="chevron" size={16} />
            </summary>
            <dl className="system-details-list">
              <div>
                <dt>Версія FFmpeg</dt>
                <dd className="system-details-raw">{runtime.ffmpegVersion ?? "Недоступна"}</dd>
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
                <dd className="system-details-raw">
                  {availableEncoders.length
                    ? availableEncoders.map((encoder) => encoder.name).join(", ")
                    : "Не виявлено"}
                </dd>
              </div>
            </dl>
          </details>
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
