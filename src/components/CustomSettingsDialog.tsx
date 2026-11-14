import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import UseAnimations from "react-useanimations";
import xSquare from "react-useanimations/lib/xSquare";
import type { CustomSettings, RuntimeInfo } from "../types";
import { CustomSettingsPanel } from "./CustomSettingsPanel";
import { Icon } from "./Icon";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function CustomSettingsDialog({
  open,
  settings,
  runtime,
  targetSizeBytes,
  onChange,
  onClose,
}: {
  open: boolean;
  settings: CustomSettings;
  runtime: RuntimeInfo | null;
  targetSizeBytes: number | null;
  onChange: (settings: CustomSettings) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [popoverContainer, setPopoverContainer] = useState<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setVisible(false);
    if (!mounted) return;

    const closeDuration =
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--modal-close-dur"),
      ) || 150;
    const timer = window.setTimeout(() => setMounted(false), closeDuration);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [mounted]);

  if (!mounted) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
    ).filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
    if (focusable.length === 0) return;

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

  return (
    <div
      className={`ffmpeg-dialog-backdrop custom-settings-backdrop ${visible ? "is-open" : "is-closing"}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`ffmpeg-dialog custom-settings-dialog t-modal ${visible ? "is-open" : "is-closing"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-settings-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <header className="ffmpeg-dialog-header">
          <div className="ffmpeg-dialog-title">
            <span className="ffmpeg-dialog-mark"><Icon name="compress" size={22} /></span>
            <div>
              <span className="ffmpeg-dialog-eyebrow">ВЛАСНИЙ РЕЖИМ · РУЧНЕ НАЛАШТУВАННЯ</span>
              <h2 id="custom-settings-dialog-title">Параметри обробки</h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button custom-settings-close-button"
            type="button"
            aria-label="Закрити налаштування"
            onClick={onClose}
          >
            <UseAnimations animation={xSquare} interaction="hover-replay" size={54} />
          </button>
        </header>

        <div className="ffmpeg-dialog-content custom-settings-dialog-content">
          <CustomSettingsPanel
            settings={settings}
            runtime={runtime}
            targetSizeBytes={targetSizeBytes}
            popoverContainer={popoverContainer}
            showHeading={false}
            onChange={onChange}
          />
        </div>

        <div
          ref={setPopoverContainer}
          className="custom-settings-popover-layer"
        />

        <footer className="ffmpeg-dialog-footer custom-settings-dialog-footer">
          <button className="button button-primary" type="button" onClick={onClose}>
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
