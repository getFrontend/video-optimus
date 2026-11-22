import { useRef } from "react";
import checkBox from "react-useanimations/lib/checkBox";
import deleteIcon from "react-useanimations/lib/delete";
import folder from "react-useanimations/lib/folder";
import refresh from "react-useanimations/lib/refresh";
import visibility2 from "react-useanimations/lib/visibility2";
import type { AppSettings, VideoJob } from "../types";
import { formatDuration, formatFrameRate, formatSize, statusLabel } from "../lib/format";
import { estimateOutputSize } from "../lib/estimate";
import { isSuccessfulJob } from "../lib/jobs";
import { AnimatedIcon } from "./AnimatedIcon";
import { Icon } from "./Icon";
import { VideoThumbnail } from "./VideoThumbnail";

const activeStatuses = new Set(["analyzing", "preparing", "encoding", "validating"]);

type SavingsTone = "saving" | "variable" | "increase";

type SavingsSummary = {
  label: string;
  compactValue: string;
  detailValue: string;
  description: string;
  direction: string;
  tone: SavingsTone;
};

function describeSavings(
  sourceSize: number,
  minBytes: number,
  maxBytes: number,
): SavingsSummary {
  const minSavings = sourceSize - maxBytes;
  const maxSavings = sourceSize - minBytes;

  if (minSavings >= 0) {
    const minPercent = Math.round((minSavings / sourceSize) * 100);
    const maxPercent = Math.round((maxSavings / sourceSize) * 100);
    const detailValue = minSavings > 0
      ? `${formatSize(minSavings)}–${formatSize(maxSavings)}`
      : `до ${formatSize(maxSavings)}`;
    return {
      label: "Можлива економія",
      compactValue: minSavings > 0
        ? `${minPercent}–${maxPercent}%`
        : `до ${maxPercent}%`,
      detailValue,
      description: `Можлива економія ${detailValue}, або ${minPercent}–${maxPercent}% від початкового розміру.`,
      direction: "менше",
      tone: "saving" as SavingsTone,
    };
  }

  if (maxSavings > 0) {
    const maxIncrease = Math.abs(minSavings);
    const maxSavingPercent = Math.round((maxSavings / sourceSize) * 100);
    const maxIncreasePercent = Math.round((maxIncrease / sourceSize) * 100);
    return {
      label: "Результат залежить від відео",
      compactValue: `−${maxSavingPercent}% / +${maxIncreasePercent}%`,
      detailValue: `−${formatSize(maxSavings)} / +${formatSize(maxIncrease)}`,
      description: `Розмір може зменшитись до ${formatSize(maxSavings)} (${maxSavingPercent}%) або збільшитись до ${formatSize(maxIncrease)} (${maxIncreasePercent}%).`,
      direction: "менше / більше",
      tone: "variable" as SavingsTone,
    };
  }

  const minIncrease = minBytes - sourceSize;
  const maxIncrease = maxBytes - sourceSize;
  const detailValue = minIncrease > 0
    ? `${formatSize(minIncrease)}–${formatSize(maxIncrease)}`
    : `до ${formatSize(maxIncrease)}`;
  const minPercent = Math.round((minIncrease / sourceSize) * 100);
  const maxPercent = Math.round((maxIncrease / sourceSize) * 100);
  return {
    label: "Можливе збільшення",
    compactValue: minIncrease > 0
      ? `${minPercent}–${maxPercent}%`
      : `до ${maxPercent}%`,
    detailValue,
    description: `Розмір може збільшитись ${detailValue}.`,
    direction: "більше",
    tone: "increase" as SavingsTone,
  };
}

export function QueueItem({
  job,
  settings,
  onCompare,
  index,
  showDragHandle,
  isSingle,
  isDragging,
  isDropTarget,
  onReorder,
  onDragStart,
  onDragComplete,
  onDragCancel,
  onDragTarget,
  onRemove,
  onRetry,
  selectable,
  selected,
  onSelect,
  onSetSkipped,
  onOpen,
}: {
  job: VideoJob;
  settings: AppSettings;
  onCompare: (job: VideoJob) => void;
  index: number;
  showDragHandle: boolean;
  isSingle: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onReorder: (id: string, index: number) => void;
  onDragStart: (id: string) => void;
  onDragComplete: (targetId: string | null) => void;
  onDragCancel: () => void;
  onDragTarget: (id: string | null) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  selectable: boolean;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onSetSkipped: (id: string, skipped: boolean) => void;
  onOpen: (path: string, reveal?: boolean) => void;
}) {
  const activePointerId = useRef<number | null>(null);
  const active = activeStatuses.has(job.status);
  const pending = job.status === "pending";
  const skipped = job.status === "skipped";
  const successful = isSuccessfulJob(job);
  const saved = job.outputSize == null ? 0 : Math.max(0, job.sourceSize - job.outputSize);
  const percentSaved = job.outputSize == null
    ? 0
    : Math.round((saved / Math.max(job.sourceSize, 1)) * 100);
  const progress = Math.min(100, Math.max(0, job.progress));
  const estimateMode = pending ? settings.mode : job.mode;
  const estimateQuality = pending ? settings.quality : job.quality;
  const estimateCustomSettings = pending ? settings.customSettings : job.customSettings;
  const targetSizeBytes = pending ? settings.targetSizeBytes : job.targetSizeBytes;
  const estimate = !active &&
    !successful &&
    targetSizeBytes == null
    ? estimateOutputSize(
      job.sourceSize,
      job.metadata,
      estimateMode,
      estimateQuality,
      estimateCustomSettings,
    )
    : null;
  const savings = estimate
    ? describeSavings(job.sourceSize, estimate.minBytes, estimate.maxBytes)
    : null;
  const showTargetSize = targetSizeBytes != null && !active && !successful;
  const hasEstimate = showTargetSize || estimate != null;
  const hasResult = successful && job.outputSize != null;
  const estimateBasis = estimate?.basis === "bitrate"
    ? "Оцінка на основі тривалості та бітрейту медіапотоків"
    : "Оцінка на основі типових коефіцієнтів обраних параметрів";

  return (
    <article
      className={`queue-item${active ? " is-active" : ""}${skipped ? " is-skipped" : ""}${hasEstimate || hasResult ? " has-estimate" : ""}${isSingle ? " is-single" : ""}${isDragging ? " is-dragging" : ""}${isDropTarget ? " is-drop-target" : ""}`}
      data-job-id={job.id}
      data-pending={pending}
    >
      {showDragHandle ? (
        <button
          className="queue-grip"
          type="button"
          aria-label={`Змінити порядок: ${job.fileName}`}
          title={pending ? "Перетягніть або натискайте стрілки, щоб змінити порядок" : undefined}
          disabled={!pending}
          onPointerDown={(event) => {
            if (!pending || event.button !== 0) return;
            event.preventDefault();
            activePointerId.current = event.pointerId;
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            onDragStart(job.id);
          }}
          onPointerMove={(event) => {
            if (activePointerId.current !== event.pointerId) return;
            const row = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>(".queue-item[data-job-id]");
            onDragTarget(row?.dataset.pending === "true" ? row.dataset.jobId ?? null : null);
          }}
          onPointerUp={(event) => {
            if (activePointerId.current !== event.pointerId) return;
            activePointerId.current = null;
            const row = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>(".queue-item[data-job-id]");
            onDragComplete(row?.dataset.pending === "true" ? row.dataset.jobId ?? null : null);
          }}
          onPointerCancel={(event) => {
            if (activePointerId.current !== event.pointerId) return;
            activePointerId.current = null;
            onDragCancel();
          }}
          onKeyDown={(event) => {
            if (!pending || index < 0) return;
            if (event.key === "ArrowUp" && index > 0) {
              event.preventDefault();
              onReorder(job.id, index - 1);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              onReorder(job.id, index + 1);
            }
          }}
        >
          <Icon name="grip" size={16} />
        </button>
      ) : !isSingle ? (
        <span className="queue-grip queue-grip-placeholder" aria-hidden="true" />
      ) : null}
      <VideoThumbnail
        jobId={job.id}
        fileName={job.fileName}
        codec={job.metadata.codec}
        skipped={skipped}
        onPlay={() => onOpen(job.path)}
      />

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
        {job.resultWarning && <p className="job-warning">{job.resultWarning}</p>}
        {job.error && <p className="job-error" title={job.error}>{job.error}</p>}
        {job.diagnosticLog && (
          <button
            className="job-log-link"
            type="button"
            onClick={() => onOpen(job.diagnosticLog!, true)}
          >
            Відкрити технічний журнал
          </button>
        )}
      </div>

      {active && (
        <div className="queue-progress">
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`Обробка файлу ${job.fileName}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-valuetext={`${Math.round(progress)}%${job.speed ? `, ${job.speed}` : ""}${job.etaSeconds != null ? `, залишилося ${formatDuration(job.etaSeconds)}` : ""}`}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <div className="progress-details">
            <span className="progress-percent">{Math.round(progress)}%</span>
            {job.speed && <span className="progress-speed">{job.speed}</span>}
            {job.etaSeconds != null && (
              <span className="progress-eta" title={`Залишилося ${formatDuration(job.etaSeconds)}`}>
                <Icon name="clock" size={14} />
                {formatDuration(job.etaSeconds)}
              </span>
            )}
          </div>
        </div>
      )}

      {showTargetSize ? (
        <aside
          className="queue-estimate"
          aria-label={`${pending ? "Оцінка. " : ""}Цільовий розмір: ${formatSize(targetSizeBytes)}`}
          title={pending ? "Оцінка за поточними параметрами; завдання не змінено." : undefined}
        >
          <span className="queue-estimate-label">Цільовий розмір</span>
          <strong>{formatSize(targetSizeBytes)}</strong>
          <span className="queue-estimate-note">фактичний розмір може відрізнятися</span>
        </aside>
      ) : estimate && (
        <aside
          className="queue-estimate"
          aria-label={`${pending ? "Оцінка. " : ""}Орієнтовний розмір після стиснення: ${formatSize(estimate.minBytes)}–${formatSize(estimate.maxBytes)}. ${savings?.description}`}
          title={`${pending ? "Оцінка за поточними параметрами; завдання не змінено. " : `${estimateBasis}; `}Фактичний розмір залежить від вмісту. ${savings?.description}`}
        >
          <div className="queue-estimate-primary">
            <span className="queue-estimate-label">Після стиснення</span>
            <strong className="queue-estimate-output">{formatSize(estimate.minBytes)}–{formatSize(estimate.maxBytes)}</strong>
          </div>
          {savings && (
            <>
              <div className={`queue-estimate-benefit is-${savings.tone}`}>
                <span className="queue-estimate-benefit-label">{savings.label}</span>
                <strong className="queue-estimate-benefit-value">{savings.detailValue}</strong>
              </div>
              <span className={`queue-estimate-percent is-${savings.tone}`}>
                {savings.tone === "saving" && <Icon name="arrowDown" size={12} />}
                {savings.tone === "increase" && <Icon name="arrowUp" size={12} />}
                <strong>{savings.compactValue}</strong>
                <span>{savings.direction}</span>
              </span>
            </>
          )}
        </aside>
      )}

      {hasResult && (
        <aside
          className="queue-result"
          aria-label={`Результат стиснення: ${formatSize(job.outputSize!)}, економія ${percentSaved}%${job.encoder ? `, кодек ${job.encoder}` : ""}`}
        >
          <div className="queue-result-primary">
            <span className="queue-result-label">Результат</span>
            <strong className="queue-result-output">{formatSize(job.outputSize!)}</strong>
          </div>
          {job.encoder && (
            <div className="queue-result-encoder">
              <span className="queue-result-label">Кодек</span>
              <strong className="queue-result-encoder-value">{job.encoder}</strong>
            </div>
          )}
          <span className="queue-result-percent">
            <Icon name="arrowDown" size={12} />
            <strong>−{percentSaved}%</strong>
          </span>
        </aside>
      )}

      <div className="queue-actions">
        {successful && (
          <button
            className="icon-button"
            type="button"
            aria-label={`Порівняти оригінал і результат: ${job.fileName}`}
            title="Порівняти оригінал і результат"
            onClick={() => onCompare(job)}
          >
            <Icon name="compare" size={20} />
          </button>
        )}
        {successful && (
          <button className="icon-button" type="button" aria-label="Показати в теці" title="Показати в теці" onClick={() => onOpen(job.outputPath, true)}>
            <AnimatedIcon animation={folder} interaction="hover" size={26} />
          </button>
        )}
        {(pending || skipped) && (
          <button
            className="icon-button queue-visibility-action"
            type="button"
            aria-label={skipped ? "Повернути відео в чергу" : "Пропустити відео"}
            title={skipped ? "Повернути відео в чергу" : "Пропустити відео"}
            onClick={() => onSetSkipped(job.id, !skipped)}
          >
            <AnimatedIcon
              animation={visibility2}
              interaction="click-toggle"
              active={skipped}
              size={26}
            />
          </button>
        )}
        {["failed", "cancelled", "interrupted"].includes(job.status) && (
          <button className="icon-button retry-action" type="button" aria-label="Повторити завдання" title="Повторити" onClick={() => onRetry(job.id)}>
            <AnimatedIcon animation={refresh} interaction="hover" size={26} />
          </button>
        )}
        {!active && (
          <AnimatedIcon
            animation={deleteIcon}
            interaction="hover-replay"
            size={30}
            render={(eventProps, animationProps) => (
              <button
                {...eventProps}
                className="icon-button danger-action"
                type="button"
                aria-label="Вилучити з черги"
                title="Вилучити з черги"
                onClick={(event) => {
                  eventProps.onClick(event);
                  onRemove(job.id);
                }}
              >
                <span {...animationProps} />
              </button>
            )}
          />
        )}
        {selectable ? (
          <label className="queue-select">
            <input
              type="checkbox"
              checked={selected}
              aria-label={`Вибрати ${job.fileName} для групових дій`}
              onChange={(event) => onSelect(job.id, event.target.checked)}
            />
            <AnimatedIcon
              animation={checkBox}
              interaction="click-toggle"
              active={selected}
              size={27}
            />
          </label>
        ) : (
          <span
            className="queue-select queue-select-placeholder"
            aria-hidden="true"
          />
        )}
      </div>
    </article>
  );
}
