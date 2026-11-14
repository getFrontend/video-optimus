import { useEffect, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent } from "react";

export type WorkspaceTab = "add" | "processing" | "completed";
const WORKSPACE_TABS: WorkspaceTab[] = ["add", "processing", "completed"];

export function WorkspaceTabs({
  activeTab,
  processingCount,
  completedCount,
  onSelect,
}: {
  activeTab: WorkspaceTab;
  processingCount: number;
  completedCount: number;
  onSelect: (tab: WorkspaceTab) => void;
}) {
  const activeTabRef = useRef(activeTab);
  const tabsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const tabButtonRefs = useRef<Partial<Record<WorkspaceTab, HTMLButtonElement>>>({});
  const hasPainted = useRef(false);
  activeTabRef.current = activeTab;

  const movePill = (tab: WorkspaceTab, animate: boolean) => {
    const button = tabButtonRefs.current[tab];
    const pill = pillRef.current;
    if (!button || !pill) return;

    if (!animate) {
      const previousTransition = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = `translateX(${button.offsetLeft}px)`;
      pill.style.width = `${button.offsetWidth}px`;
      void pill.offsetWidth;
      pill.style.transition = previousTransition;
      return;
    }

    pill.style.transform = `translateX(${button.offsetLeft}px)`;
    pill.style.width = `${button.offsetWidth}px`;
  };

  useLayoutEffect(() => {
    movePill(activeTab, hasPainted.current);
    hasPainted.current = true;
  }, [activeTab]);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    const updatePill = () => movePill(activeTabRef.current, false);
    const observer = new ResizeObserver(updatePill);
    observer.observe(tabs);
    Object.values(tabButtonRefs.current).forEach((button) => {
      if (button) observer.observe(button);
    });
    window.addEventListener("resize", updatePill);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePill);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentTab: WorkspaceTab) => {
    const currentIndex = WORKSPACE_TABS.indexOf(currentTab);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % WORKSPACE_TABS.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? WORKSPACE_TABS.length - 1
            : -1;

    if (nextIndex < 0) return;
    event.preventDefault();
    const nextTab = WORKSPACE_TABS[nextIndex];
    onSelect(nextTab);
    tabButtonRefs.current[nextTab]?.focus();
  };

  return (
    <nav className="workspace-nav" aria-label="Розділи роботи з відео">
      <div className="workspace-tabs t-tabs" role="tablist" aria-label="Розділи">
        <span className="t-tabs-pill" aria-hidden="true" ref={pillRef} />
        <button
          ref={(node) => { tabButtonRefs.current.add = node ?? undefined; }}
          className="workspace-tab t-tab"
          id="workspace-tab-add"
          role="tab"
          aria-selected={activeTab === "add"}
          aria-controls="workspace-panel"
          tabIndex={activeTab === "add" ? 0 : -1}
          type="button"
          onKeyDown={(event) => handleKeyDown(event, "add")}
          onClick={() => onSelect("add")}
        >
          Додаю
        </button>
        <button
          ref={(node) => { tabButtonRefs.current.processing = node ?? undefined; }}
          className="workspace-tab t-tab"
          id="workspace-tab-processing"
          role="tab"
          aria-selected={activeTab === "processing"}
          aria-controls="workspace-panel"
          tabIndex={activeTab === "processing" ? 0 : -1}
          type="button"
          onKeyDown={(event) => handleKeyDown(event, "processing")}
          onClick={() => onSelect("processing")}
        >
          Обробляю <span className="workspace-tab-count">{processingCount}</span>
        </button>
        <button
          ref={(node) => { tabButtonRefs.current.completed = node ?? undefined; }}
          className="workspace-tab t-tab"
          id="workspace-tab-completed"
          role="tab"
          aria-selected={activeTab === "completed"}
          aria-controls="workspace-panel"
          tabIndex={activeTab === "completed" ? 0 : -1}
          type="button"
          onKeyDown={(event) => handleKeyDown(event, "completed")}
          onClick={() => onSelect("completed")}
        >
          Готово <span className="workspace-tab-count">{completedCount}</span>
        </button>
      </div>
    </nav>
  );
}
