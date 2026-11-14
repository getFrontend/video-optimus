import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import { Icon } from "./Icon";
import { QueueItem } from "./QueueItem";
import { QueueBulkToolbar } from "./QueueBulkToolbar";
import { PreviewComparator } from "./PreviewComparator";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";
import { SELECTABLE_STATUSES, useBulkQueueSelection } from "../hooks/useBulkQueueSelection";
import { usePreviewComparison } from "../hooks/usePreviewComparison";
import { useOptimizer } from "../hooks/useOptimizer";
import type { JobStatus, VideoJob } from "../types";

const ACTIVE: JobStatus[] = ["analyzing", "preparing", "encoding", "validating"];

export function VideoWorkspace({
  optimizer,
  jobs,
  pendingCount,
  completedCount,
}: {
  optimizer: ReturnType<typeof useOptimizer>;
  jobs: VideoJob[];
  pendingCount: number;
  completedCount: number;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("add");
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const draggedJobRef = useRef<string | null>(null);
  const tabContentRef = useRef<HTMLDivElement>(null);
  const queuePanelRef = useRef<HTMLElement>(null);
  const positionsBeforeReorder = useRef<Map<string, DOMRect> | null>(null);
  const previousJobIds = useRef<Set<string> | null>(null);
  const hasSnapshot = optimizer.snapshot !== null;
  const preview = usePreviewComparison(
    jobs,
    optimizer.createPreview,
    optimizer.removePreview,
  );
  const activeJob = jobs.find((job) => ACTIVE.includes(job.status));
  const processingJobs = jobs.filter((job) => job.status !== "completed");
  const activeJobs = jobs.filter((job) => ACTIVE.includes(job.status));
  const pendingJobs = jobs.filter((job) => job.status === "pending");
  const attentionJobs = processingJobs.filter(
    (job) => job.status !== "pending" && !ACTIVE.includes(job.status),
  );
  const bulk = useBulkQueueSelection(jobs, optimizer.startSelectedJobs);
  const selectedPendingCount = bulk.selectedJobs.filter((job) => job.status === "pending").length;
  const selectedRetryableCount = bulk.selectedJobs.filter(
    (job) => ["failed", "cancelled", "interrupted"].includes(job.status),
  ).length;
  const queueRunning = optimizer.snapshot?.queueRunning ?? false;
  const pendingIndex = useMemo(() => {
    let position = 0;
    return new Map(jobs.filter((job) => job.status === "pending").map((job) => [job.id, position++]));
  }, [jobs]);
  const pendingOrder = pendingJobs.map((job) => job.id).join("\0");
  const queueActionReady = Boolean(
    pendingCount > 0 ||
    optimizer.snapshot?.queuePaused ||
    optimizer.snapshot?.queueRunning ||
    bulk.selectedJobs.length > 0,
  );

  const selectTab = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      tabContentRef.current?.scrollIntoView({ block: "start" });
    });
  }, []);

  useEffect(() => {
    if (!hasSnapshot) return;

    const currentJobIds = new Set(jobs.map((job) => job.id));
    const previousIds = previousJobIds.current;
    previousJobIds.current = currentJobIds;

    if (previousIds && jobs.some((job) => !previousIds.has(job.id))) {
      selectTab("processing");
    }
  }, [hasSnapshot, jobs, selectTab]);

  const reorderJob = useCallback((id: string, targetIndex: number) => {
    const sourceIndex = pendingIndex.get(id);
    const boundedTarget = Math.max(0, Math.min(targetIndex, pendingJobs.length - 1));
    if (sourceIndex == null || sourceIndex === boundedTarget) return;

    const positions = new Map<string, DOMRect>();
    queuePanelRef.current?.querySelectorAll<HTMLElement>("[data-job-id]").forEach((item) => {
      const jobId = item.dataset.jobId;
      if (jobId) positions.set(jobId, item.getBoundingClientRect());
    });
    positionsBeforeReorder.current = positions;
    optimizer.reorderJob(id, boundedTarget);
  }, [optimizer, pendingIndex, pendingJobs.length]);

  const beginDrag = useCallback((id: string) => {
    draggedJobRef.current = id;
    setDraggedJobId(id);
  }, []);

  const completeDrag = useCallback((targetId: string | null) => {
    const draggedId = draggedJobRef.current;
    draggedJobRef.current = null;
    setDraggedJobId(null);
    setDropTargetId(null);

    const targetIndex = targetId ? pendingIndex.get(targetId) : undefined;
    if (draggedId && targetIndex != null) reorderJob(draggedId, targetIndex);
  }, [pendingIndex, reorderJob]);

  const cancelDrag = useCallback(() => {
    draggedJobRef.current = null;
    setDraggedJobId(null);
    setDropTargetId(null);
  }, []);

  const updateDropTarget = useCallback((id: string | null) => {
    setDropTargetId(id && pendingIndex.has(id) ? id : null);
  }, [pendingIndex]);

  useLayoutEffect(() => {
    const previousPositions = positionsBeforeReorder.current;
    if (!previousPositions) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      positionsBeforeReorder.current = null;
      return;
    }

    queuePanelRef.current?.querySelectorAll<HTMLElement>("[data-job-id]").forEach((item) => {
      const jobId = item.dataset.jobId;
      const previous = jobId ? previousPositions.get(jobId) : undefined;
      if (!previous) return;

      const offsetY = previous.top - item.getBoundingClientRect().top;
      if (Math.abs(offsetY) < 1) return;

      const animation = item.animate(
        [{ transform: `translateY(${offsetY}px)` }, { transform: "translateY(0)" }],
        { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
      animation.onfinish = () => animation.cancel();
    });
    positionsBeforeReorder.current = null;
  }, [pendingOrder]);

  const renderJobs = (items: VideoJob[]) => (
    <div className="queue-list">
      {items.map((job) => (
        <QueueItem
          key={job.id}
          job={job}
          settings={optimizer.settings}
          index={pendingIndex.get(job.id) ?? -1}
          isDragging={draggedJobId === job.id}
          isDropTarget={dropTargetId === job.id && draggedJobId !== job.id}
          onReorder={reorderJob}
          onDragStart={beginDrag}
          onDragComplete={completeDrag}
          onDragCancel={cancelDrag}
          onDragTarget={updateDropTarget}
          onRemove={optimizer.removeJob}
          onRetry={optimizer.retryJob}
          selectable={
            SELECTABLE_STATUSES.includes(job.status) &&
            !queueRunning
          }
          selected={bulk.selectedIds.has(job.id)}
          onSelect={bulk.selectJob}
          onPreview={preview.open}
          onSkip={optimizer.skipJob}
          onOpen={optimizer.openPath}
        />
      ))}
    </div>
  );

  return (
    <div className="workspace-content">
      <WorkspaceTabs
        activeTab={activeTab}
        processingCount={processingJobs.length}
        completedCount={completedCount}
        onSelect={selectTab}
        actions={activeTab === "processing" && bulk.selectedJobs.length > 0 ? (
          <QueueBulkToolbar
            selectedCount={bulk.selectedJobs.length}
            onClear={bulk.clear}
          />
        ) : null}
      />

      <div
        className="workspace-tab-content"
        id="workspace-panel"
        role="tabpanel"
        aria-labelledby={`workspace-tab-${activeTab}`}
        ref={tabContentRef}
      >
        {activeTab === "add" && (
          <div className="add-panel">
            <DropZone
              available={optimizer.desktop && Boolean(optimizer.snapshot?.runtime.ready)}
              dragging={optimizer.dragging}
              onFiles={optimizer.chooseFiles}
              onFolder={optimizer.chooseFolder}
            />
          </div>
        )}

        {activeTab === "processing" && (
          <section className="queue-panel" aria-label="Обробка відео" ref={queuePanelRef}>
            <div className="queue-heading">
              <div className="queue-sequence-heading">
                <Icon name="clock" size={20} />
                <strong>Послідовна обробка</strong>
                <span aria-hidden="true">·</span>
                <span>Одне відео за раз</span>
              </div>
              <div className="queue-heading-actions">
                {activeJob && (
                  <button className="button button-quiet button-cancel" type="button" onClick={optimizer.cancelCurrent}>
                    <Icon name="close" size={16} />
                    Скасувати поточне
                  </button>
                )}
              </div>
            </div>

            {processingJobs.length === 0 ? (
              <div className="empty-queue">
                <Icon name={completedCount > 0 ? "check" : "film"} size={28} />
                <strong>{completedCount > 0 ? "Усі відео оброблено" : "Поки немає відео для обробки"}</strong>
                <p>
                  {completedCount > 0
                    ? "Готові результати збережені в розділі готових відео."
                    : "Додайте окреме відео, кілька файлів або цілу теку."}
                </p>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => selectTab(completedCount > 0 ? "completed" : "add")}
                >
                  {completedCount > 0 ? "Переглянути готові" : "Додати відео"}
                </button>
              </div>
            ) : (
              <>
                {activeJobs.length > 0 && (
                  <section className="queue-group" aria-label="Відео в обробці">
                    <h3>Зараз обробляються <span>{activeJobs.length}</span></h3>
                    {renderJobs(activeJobs)}
                  </section>
                )}
                {pendingJobs.length > 0 && (
                  <section className="queue-group" aria-label="Відео, що очікують обробки">
                    {renderJobs(pendingJobs)}
                  </section>
                )}
                {attentionJobs.length > 0 && (
                  <section className="queue-group" aria-label="Інші незавершені відео">
                    <h3>Потребують уваги <span>{attentionJobs.length}</span></h3>
                    {renderJobs(attentionJobs)}
                  </section>
                )}
                {queueActionReady && (
                  <footer className="queue-footer">
                    <div className="queue-footer-actions">
                      {pendingCount > 0 && (
                        <button className="button button-cancel-pending" type="button" onClick={optimizer.cancelPending}>
                          <Icon name="queueRemove" size={17} />
                          Скасувати очікування
                        </button>
                      )}
                      <button
                        className="button button-primary queue-run-button"
                        type="button"
                        disabled={!optimizer.desktop || !optimizer.snapshot?.runtime.ready}
                        onClick={() => {
                          if (optimizer.snapshot?.queuePaused) optimizer.startQueue();
                          else if (optimizer.snapshot?.queueRunning) optimizer.stopQueue();
                          else if (bulk.selectedJobs.length > 0) void bulk.startSelected();
                          else optimizer.startQueue();
                        }}
                      >
                        <Icon
                          name={optimizer.snapshot?.queueRunning && !optimizer.snapshot?.queuePaused ? "pause" : "play"}
                          size={17}
                        />
                        {optimizer.snapshot?.queuePaused
                          ? "Продовжити обробку"
                          : optimizer.snapshot?.queueRunning
                            ? "Зупинити після відео"
                            : selectedPendingCount > 0
                              ? "Обробити вибрані"
                              : selectedRetryableCount > 0
                                ? selectedRetryableCount === 1
                                  ? "Повторити невдалий"
                                  : "Повторити невдалі"
                                : "Запустити обробку"}
                      </button>
                    </div>
                  </footer>
                )}
              </>
            )}
          </section>
        )}

        {activeTab === "completed" && (
          <section className="queue-panel">
            <div className="queue-heading">
              <h2>
                Готові відео
                {completedCount > 0 && <span className="queue-count">{completedCount}</span>}
              </h2>
              {completedCount > 0 && (
                <button className="button button-quiet" type="button" onClick={optimizer.clearCompleted}>
                  <Icon name="trash" size={16} />
                  Очистити готові
                </button>
              )}
            </div>
            {completedCount > 0 ? (
              renderJobs(jobs.filter((job) => job.status === "completed"))
            ) : (
              <div className="empty-queue">
                <Icon name="film" size={28} />
                <strong>Готових відео ще немає</strong>
                <p>Після обробки результати з’являться тут.</p>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => selectTab(processingJobs.length > 0 ? "processing" : "add")}
                >
                  {processingJobs.length > 0 ? "Перейти до обробки" : "Додати відео"}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      {preview.job && (
        <PreviewComparator
          job={preview.job}
          preview={preview.result}
          loading={preview.loading}
          error={preview.error}
          onClose={preview.close}
        />
      )}
    </div>
  );
}
