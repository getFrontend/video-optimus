import type { VideoJob } from "../types";
import { formatDuration, formatFrameRate, formatSize, statusLabel } from "../lib/format";
import { estimateOutputSize } from "../lib/estimate";
import { Icon } from "./Icon";

const activeStatuses = new Set(["analyzing", "preparing", "encoding", "validating"]);

export function QueueItem({
  job,
  index,
  onReorder,
  onRemove,
  onRetry,
  onSkip,
  onOpen,
}: {
  job: VideoJob;
  index: number;
  onReorder: (id: string, index: number) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onSkip: (id: string) => void;
  onOpen: (path: string, reveal?: boolean) => void;
}) {
  const active = activeStatuses.has(job.status);
  const saved = job.outputSize == null ? 0 : Math.max(0, job.sourceSize - job.outputSize);
  const percentSaved = job.outputSize == null
    ? 0
    : Math.round((saved / Math.max(job.sourceSize, 1)) * 100);
  const progress = Math.min(100, Math.max(0, job.progress));
  const estimate = job.status === "pending"
    ? estimateOutputSize(job.sourceSize, job.mode, job.quality)
    : null;

  return (
    <article
      className={`queue-item${active ? " is-active" : ""}`}
      draggable={job.status === "pending"}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", job.id);
      }}
      onDragOver={(event) => {
        if (job.status === "pending") event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const draggedId = event.dataTransfer.getData("text/plain");
        if (job.status === "pending" && draggedId && draggedId !== job.id) {
          onReorder(draggedId, index);
        }
      }}
    >
      <div className="queue-grip" aria-hidden="true">
        <Icon name="grip" size={16} />
      </div>
      <div className={`file-mark codec-${job.metadata.codec}`}>
        <Icon name="film" size={24} />
      </div>

      <div className="queue-main">
        <div className="queue-title-row">
          <strong className="file-name" title={job.path}>{job.fileName}</strong>
          <span className={`status-badge status-${job.status}`}>
            {statusLabel(job.status)}
          </span>
        </div>
        <div className="file-metadata">
          <span>{formatSize(job.sourceSize)}</span>
          <span>{formatDuration(job.metadata.durationSeconds)}</span>
          <span>{job.metadata.width} × {job.metadata.height}</span>
          <span>{formatFrameRate(job.metadata.frameRate)}</span>
          {job.metadata.isVfr && <span className="metadata-tag">VFR</span>}
          {job.metadata.isHdr && <span className="metadata-tag">HDR</span>}
        </div>
        {estimate && (
          <div
            className="size-estimate"
            title="Фактичний розмір залежить від вмісту відео й може відрізнятися від оцінки."
          >
            <span>Орієнтовно після стиснення:</span>
            <strong>{formatSize(estimate.minBytes)}–{formatSize(estimate.maxBytes)}</strong>
          </div>
        )}
        {active && (
          <div className="queue-progress">
            <div
              className="progress-track"
              role="progressbar"
              aria-label={`Обробка файлу ${job.fileName}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <span style={{ transform: `scaleX(${progress / 100})` }} />
            </div>
            <span className="progress-percent">{Math.round(progress)}%</span>
            {job.speed && <span className="progress-speed">{job.speed}</span>}
            {job.etaSeconds != null && <span className="progress-eta">залишилося {formatDuration(job.etaSeconds)}</span>}
          </div>
        )}
        {job.status === "completed" && job.outputSize != null && (
          <div className="result-line">
            <span>Результат: {formatSize(job.outputSize)}</span>
            <strong>−{percentSaved}%</strong>
            {job.encoder && <span>{job.encoder}</span>}
          </div>
        )}
        {job.error && <p className="job-error" title={job.error}>{job.error}</p>}
      </div>

      <div className="queue-actions">
        {job.status === "completed" && job.outputPath && (
          <>
            <button className="icon-button result-action" type="button" aria-label="Відтворити відео" title="Відтворити відео" onClick={() => onOpen(job.outputPath!)}>
              <Icon name="play" size={20} />
            </button>
            <button className="icon-button" type="button" aria-label="Показати в теці" title="Показати в теці" onClick={() => onOpen(job.outputPath!, true)}>
              <Icon name="folder" size={20} />
            </button>
          </>
        )}
        {job.status === "pending" && (
          <button className="icon-button" type="button" aria-label="Пропустити відео" title="Пропустити відео" onClick={() => onSkip(job.id)}>
            <Icon name="skipForward" size={20} />
          </button>
        )}
{["failed", "cancelled", "interrupted"].includes(job.status) && (
          <button className="icon-button retry-action" type="button" aria-label="Повторити завдання" title="Повторити" onClick={() => onRetry(job.id)}>
            <Icon name="refresh" size={20} />
          </button>
        )}
        {!active && (
          <button className="icon-button danger-action" type="button" aria-label="Вилучити з черги" title="Вилучити з черги" onClick={() => onRemove(job.id)}>
            <Icon name="trash" size={20} />
          </button>
        )}
      </div>
    </article>
  );
}
