import { useMemo, useRef, useState } from "react";
import { DropZone } from "./DropZone";
import { Icon } from "./Icon";
import { QueueItem } from "./QueueItem";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";
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
  const tabContentRef = useRef<HTMLDivElement>(null);
  const isEmpty = Boolean(optimizer.snapshot && jobs.length === 0);
  const activeJob = jobs.find((job) => ACTIVE.includes(job.status));
  const processingJobs = jobs.filter((job) => job.status !== "completed");
  const activeJobs = jobs.filter((job) => ACTIVE.includes(job.status));
  const pendingJobs = jobs.filter((job) => job.status === "pending");
  const attentionJobs = processingJobs.filter(
    (job) => job.status !== "pending" && !ACTIVE.includes(job.status),
  );
  const pendingIndex = useMemo(() => {
    let position = 0;
    return new Map(jobs.filter((job) => job.status === "pending").map((job) => [job.id, position++]));
  }, [jobs]);

  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      tabContentRef.current?.scrollIntoView({ block: "start" });
    });
  };

  const renderJobs = (items: VideoJob[]) => (
    <div className="queue-list">
      {items.map((job) => (
        <QueueItem
          key={job.id}
          job={job}
          index={pendingIndex.get(job.id) ?? -1}
          onReorder={optimizer.reorderJob}
          onRemove={optimizer.removeJob}
          onRetry={optimizer.retryJob}
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
        optimizer={optimizer}
        onSelect={selectTab}
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
              empty={isEmpty}
              onFiles={optimizer.chooseFiles}
              onFolder={optimizer.chooseFolder}
            />
            {processingJobs.length > 0 && (
              <div className="next-step-panel">
                <div>
                  <strong>
                    {pendingCount > 0
                      ? `До обробки готово відео: ${pendingCount}`
                      : "Обробка відео вже триває"}
                  </strong>
                  <span>Перейдіть до обробки, щоб стежити за файлами та керувати ними.</span>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => selectTab("processing")}
                >
                  Перейти до обробки
                  <Icon name="arrowRight" size={16} />
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "processing" && (
          <section className="queue-panel">
            <div className="queue-heading">
              <h2>Обробка відео <span className="queue-count">{processingJobs.length}</span></h2>
              <div className="queue-heading-actions">
                {pendingCount > 0 && (
                  <button className="button button-quiet" type="button" onClick={optimizer.cancelPending}>
                    <Icon name="close" size={16} />
                    Скасувати очікування
                  </button>
                )}
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
                    <h3>Очікують обробки <span>{pendingJobs.length}</span></h3>
                    {renderJobs(pendingJobs)}
                  </section>
                )}
                {attentionJobs.length > 0 && (
                  <section className="queue-group" aria-label="Інші незавершені відео">
                    <h3>Потребують уваги <span>{attentionJobs.length}</span></h3>
                    {renderJobs(attentionJobs)}
                  </section>
                )}
                <div className="queue-footer-note queue-sequence-note">
                  <Icon name="clock" size={20} />
                  <span><strong>Послідовна обробка</strong><small>Одне відео за раз</small></span>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === "completed" && (
          <section className="queue-panel">
            <div className="queue-heading">
              <h2>Готові відео <span className="queue-count">{completedCount}</span></h2>
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
    </div>
  );
}
