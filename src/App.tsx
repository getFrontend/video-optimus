import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BrandMark } from "./components/BrandMark";
import { DropZone } from "./components/DropZone";
import { FfmpegSetupDialog } from "./components/FfmpegSetupDialog";
import { Icon } from "./components/Icon";
import { QueueItem } from "./components/QueueItem";
import { SettingsPanel } from "./components/SettingsPanel";
import { SettingsScrollbar } from "./components/SettingsScrollbar";
import { SystemPanel } from "./components/SystemPanel";
import { WindowControls } from "./components/WindowControls";
import { useOptimizer } from "./hooks/useOptimizer";
import type { JobStatus } from "./types";
import { formatSize } from "./lib/format";

const ACTIVE: JobStatus[] = ["analyzing", "preparing", "encoding", "validating"];

export default function App() {
  const optimizer = useOptimizer();
  const [ffmpegHelpOpen, setFfmpegHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const settingsToggleRef = useRef<HTMLButtonElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const previousSettingsOpen = useRef(settingsOpen);

  useEffect(() => {
    if (previousSettingsOpen.current === settingsOpen) return;
    previousSettingsOpen.current = settingsOpen;
    (settingsOpen ? settingsCloseRef : settingsToggleRef).current?.focus();
  }, [settingsOpen]);
  const jobs = optimizer.snapshot?.jobs ?? [];
  const checkingRuntime = optimizer.checkingRuntime && optimizer.desktop;
  const isEmpty = Boolean(optimizer.snapshot && jobs.length === 0);
  const pendingCount = jobs.filter((job) => job.status === "pending").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;
  const activeJob = jobs.find((job) => ACTIVE.includes(job.status));
  const queueActionReady = Boolean(
    pendingCount || optimizer.snapshot?.queuePaused || optimizer.snapshot?.queueRunning,
  );
  const pendingIndex = useMemo(() => {
    let position = 0;
    return new Map(jobs.filter((job) => job.status === "pending").map((job) => [job.id, position++]));
  }, [jobs]);

  const runOrPause = () => {
    if (optimizer.snapshot?.queuePaused) optimizer.startQueue();
    else if (optimizer.snapshot?.queueRunning) optimizer.stopQueue();
    else optimizer.startQueue();
  };

  return (
    <main
      className={`app-shell${settingsOpen ? " settings-open" : ""}`}
      onContextMenu={(event) => event.preventDefault()}
    >
      <header
        className={`topbar${optimizer.desktop ? " has-window-controls" : ""}`}
        onMouseDown={(event) => {
          if (
            !optimizer.desktop ||
            event.button !== 0 ||
            (event.target as Element).closest("button, a, input, select, textarea")
          ) {
            return;
          }
          void getCurrentWindow().startDragging();
        }}
        onDoubleClick={(event) => {
          if (!optimizer.desktop || (event.target as HTMLElement).closest(".window-controls")) return;
          void getCurrentWindow().toggleMaximize();
        }}
      >
        <div className="brand">
          <BrandMark />
          <span className="brand-name">video<span>optimus</span></span>
        </div>
        <div className="topbar-right">
          <span className={`runtime-pill${checkingRuntime ? " is-checking" : optimizer.snapshot?.runtime.ready ? " is-ready" : " is-missing"}`}>
            {checkingRuntime
              ? <span className="loading-spinner" aria-hidden="true" />
              : <Icon name={optimizer.snapshot?.runtime.ready ? "cpu" : "info"} size={16} />}
            {checkingRuntime
              ? "Перевірка FFmpeg…"
              : optimizer.snapshot?.runtime.ready
                ? optimizer.snapshot.runtime.qsvAvailable ? "QSV доступний" : "Кодування на CPU"
                : optimizer.desktop ? "Потрібен FFmpeg" : "Desktop програма"}
          </span>
          <span className="local-pill">Локальна обробка</span>
        </div>
        {optimizer.desktop && <WindowControls />}
      </header>

      <div className="page-content">
        <section className="welcome-row">
          <div className="welcome-copy">
            <h1>Оптимізація відео</h1>
            <p>Додайте файли, налаштуйте якість і запустіть чергу.</p>
          </div>
          <div className="welcome-stats">
            <div className="welcome-stat">
              <span>У черзі</span>
              <strong>{pendingCount}</strong>
            </div>
            <div className="welcome-stat">
              <span>Готово</span>
              <strong>{completedCount}</strong>
            </div>
            <div className="welcome-stat saved-stat">
              <span>Заощаджено</span>
              <strong>{formatSize(optimizer.snapshot?.totalSavedBytes ?? 0)}</strong>
            </div>
          </div>
        </section>

        {!optimizer.desktop && (
          <div className="runtime-alert">
            <Icon name="info" size={20} />
            <div>
              <strong>Це вебперегляд інтерфейсу</strong>
              <span>Щоб вибирати файли й обробляти їх, запустіть програму командами <code>npm install</code> і <code>npm run tauri dev</code>.</span>
            </div>
          </div>
        )}

        <DropZone
          available={optimizer.desktop && Boolean(optimizer.snapshot?.runtime.ready)}
          dragging={optimizer.dragging}
          empty={isEmpty}
          primaryAction={!queueActionReady}
          onFiles={optimizer.chooseFiles}
          onFolder={optimizer.chooseFolder}
        />

        <div className={`workbench${isEmpty ? " is-empty" : ""}`}>
          {jobs.length > 0 && (
            <section className="queue-panel">
              <div className="queue-heading">
                <h2>Черга <span className="queue-count">{jobs.length}</span></h2>
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
                  <button
                    className="button button-quiet"
                    type="button"
                    onClick={optimizer.clearCompleted}
                    disabled={completedCount === 0}
                  >
                    <Icon name="trash" size={16} />
                    Очистити готові
                  </button>
                </div>
              </div>

              <div className="queue-list">
                {jobs.map((job) => (
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

              <div className="queue-footer">
                <div className="queue-footer-note">
                  <Icon name="clock" size={20} />
                  <span><strong>Послідовно</strong><small>Одне завдання за раз</small></span>
                </div>
                <div className="queue-controls">
                  <button
                    className={`button ${queueActionReady ? "button-primary" : "button-secondary"} start-button`}
                    type="button"
                    disabled={!optimizer.desktop || !optimizer.snapshot?.runtime.ready || (!pendingCount && !optimizer.snapshot?.queuePaused && !optimizer.snapshot?.queueRunning)}
                    onClick={runOrPause}
                  >
                    <Icon
                      name={optimizer.snapshot?.queuePaused ? "play" : optimizer.snapshot?.queueRunning ? "pause" : "play"}
                      size={16}
                    />
                    {optimizer.snapshot?.queuePaused
                      ? "Продовжити чергу"
                      : optimizer.snapshot?.queueRunning
                        ? "Після поточного"
                        : "Запустити чергу"}
                  </button>
                </div>
              </div>
            </section>
          )}

          <aside
            className={`settings-drawer${settingsOpen ? " is-open" : ""}`}
            id="settings-drawer"
            aria-label="Параметри стиснення та стан системи"
            aria-hidden={!settingsOpen}
            inert={!settingsOpen}
          >
            <button
              ref={settingsCloseRef}
              className="settings-drawer-collapse"
              type="button"
              aria-label="Згорнути бічну панель параметрів"
              aria-controls="settings-drawer"
              aria-expanded={true}
              onClick={() => setSettingsOpen(false)}
            >
              <Icon name="close" size={18} />
            </button>
            <div
              className="settings-drawer-scroll-area"
              id="settings-scroll-area"
              ref={settingsScrollRef}
              tabIndex={0}
            >
              <div className="settings-drawer-content">
                <SettingsPanel
                  settings={optimizer.settings}
                  onMode={optimizer.setMode}
                  onQuality={optimizer.setQuality}
                  onOutput={optimizer.chooseOutput}
                />
                <SystemPanel
                  runtime={optimizer.snapshot?.runtime ?? null}
                  desktop={optimizer.desktop}
                  checkingRuntime={optimizer.checkingRuntime}
                  onOpenSetup={() => setFfmpegHelpOpen(true)}
                />
              </div>
            </div>
            <SettingsScrollbar
              viewportRef={settingsScrollRef}
              viewportId="settings-scroll-area"
            />
          </aside>
        </div>
        {!settingsOpen && (
          <button
            ref={settingsToggleRef}
            className="settings-reopen"
            type="button"
            aria-label="Відкрити параметри стиснення"
            aria-controls="settings-drawer"
            aria-expanded={false}
            title="Параметри стиснення"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="chevron" size={18} />
          </button>
        )}
      </div>

      <FfmpegSetupDialog
        open={ffmpegHelpOpen}
        onClose={() => setFfmpegHelpOpen(false)}
      />

      {optimizer.notice && (
        <div className="toast-message" role="status">
          <span className="toast-icon"><Icon name="info" size={16} /></span>
          <span>{optimizer.notice}</span>
          <button type="button" aria-label="Закрити сповіщення" onClick={optimizer.dismissNotice}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
