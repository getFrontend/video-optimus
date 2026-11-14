import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import UseAnimations from "react-useanimations";
import chevronLeft from "react-useanimations/lib/chevronLeft";
import { BrandMark } from "./components/BrandMark";
import { FfmpegSetupDialog } from "./components/FfmpegSetupDialog";
import { Icon, type IconName } from "./components/Icon";
import { SettingsPanel } from "./components/SettingsPanel";
import { SettingsScrollbar } from "./components/SettingsScrollbar";
import { SystemPanel } from "./components/SystemPanel";
import { VideoWorkspace } from "./components/VideoWorkspace";
import { WindowControls } from "./components/WindowControls";
import { useOptimizer, type NoticeType } from "./hooks/useOptimizer";
import { formatSize } from "./lib/format";

const noticeIcons = {
  info: "info",
  success: "check",
  warning: "warning",
  error: "warning",
} satisfies Record<NoticeType, IconName>;

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
  const pendingCount = jobs.filter((job) => job.status === "pending").length;
  const completedCount = jobs.filter((job) => job.status === "completed").length;

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

      <div className="page-scroll-area">
        <div className="page-content">
          <section className="welcome-row">
            <div className="welcome-copy">
              <h1>Оптимізація відео</h1>
              <p>Додавайте відео по одному або цілою текою. Оригінали залишаються незмінними.</p>
            </div>
            <div className="welcome-stats">
              <div className="welcome-stat">
                <span>Очікують</span>
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

          <div className="workbench">
            <VideoWorkspace
              optimizer={optimizer}
              jobs={jobs}
              pendingCount={pendingCount}
              completedCount={completedCount}
            />

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
                    runtime={optimizer.snapshot?.runtime ?? null}
                    onMode={optimizer.setMode}
                    onQuality={optimizer.setQuality}
                    onCustomSettings={optimizer.setCustomSettings}
                    onOutput={optimizer.chooseOutput}
                    onTargetSize={optimizer.setTargetSize}
                  />
                  <SystemPanel
                    runtime={optimizer.snapshot?.runtime ?? null}
                    desktop={optimizer.desktop}
                    checkingRuntime={optimizer.checkingRuntime}
                    onOpenSetup={() => setFfmpegHelpOpen(true)}
                  onTestHardware={optimizer.testHardwareAcceleration}
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
              <UseAnimations animation={chevronLeft} interaction="hover-replay" size={18} />
            </button>
          )}
        </div>
      </div>

      <FfmpegSetupDialog
        open={ffmpegHelpOpen}
        onClose={() => setFfmpegHelpOpen(false)}
      />

      {optimizer.notice && (
        <div
          className={`toast-message is-${optimizer.notice.type}`}
          role={optimizer.notice.type === "error" ? "alert" : "status"}
          aria-atomic="true"
        >
          <span className="toast-icon"><Icon name={noticeIcons[optimizer.notice.type]} size={16} /></span>
          <span className="toast-copy">{optimizer.notice.message}</span>
          <button type="button" aria-label="Закрити сповіщення" onClick={optimizer.dismissNotice}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
