import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const QUIT_REQUESTED_EVENT = "quit-requested";

export function QuitConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen(QUIT_REQUESTED_EVENT, () => setOpen(true));
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const close = () => {
    if (!quitting) setOpen(false);
  };

  const confirmQuit = () => {
    setQuitting(true);
    void invoke("quit_app");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      (document.activeElement === cancelRef.current ? confirmRef : cancelRef).current?.focus();
    }
  };

  return (
    <div
      className="quit-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        className="quit-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quit-dialog-title"
        aria-describedby="quit-dialog-description"
        onKeyDown={handleKeyDown}
      >
        <span className="quit-dialog-eyebrow">ЧЕРГА ПРАЦЮЄ</span>
        <h2 id="quit-dialog-title">Зупинити обробку і вийти?</h2>
        <p id="quit-dialog-description">
          Поточне відео буде перервано. Уже готові файли залишаться на місці.
        </p>
        <footer className="quit-dialog-actions">
          <button
            ref={cancelRef}
            className="button button-secondary"
            type="button"
            onClick={close}
            disabled={quitting}
          >
            Продовжити
          </button>
          <button
            ref={confirmRef}
            className="button button-primary"
            type="button"
            onClick={confirmQuit}
            disabled={quitting}
          >
            Зупинити і вийти
          </button>
        </footer>
      </section>
    </div>
  );
}
