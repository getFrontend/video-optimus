import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), summary, input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function FfmpegSetupDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
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
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setMounted(false);
    }, closeDuration);
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
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
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable?.length) return;
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
      className={`ffmpeg-dialog-backdrop ${visible ? "is-open" : "is-closing"}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`ffmpeg-dialog t-modal ${visible ? "is-open" : "is-closing"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ffmpeg-dialog-title"
        aria-describedby="ffmpeg-dialog-description"
        onKeyDown={handleKeyDown}
      >
        <header className="ffmpeg-dialog-header">
          <div className="ffmpeg-dialog-title">
            <span className="ffmpeg-dialog-mark"><Icon name="cpu" size={22} /></span>
            <div>
              <span className="ffmpeg-dialog-eyebrow">СИСТЕМА · НАЛАШТУВАННЯ</span>
              <h2 id="ffmpeg-dialog-title">Підключення FFmpeg</h2>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            aria-label="Закрити інструкцію"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <p className="ffmpeg-dialog-intro" id="ffmpeg-dialog-description">
          Video Optimus аналізує та оптимізує відео локально. Для цього потрібні
          системні утиліти <code>ffmpeg.exe</code> і <code>ffprobe.exe</code>.
          Вони не завантажують ваше відео в хмару.
        </p>

        <div className="ffmpeg-dialog-content">
          <section className="ffmpeg-instruction">
            <div className="ffmpeg-instruction-heading">
              <span className="ffmpeg-step-number">01</span>
              <div>
                <h3>Встановіть FFmpeg однією командою в PowerShell</h3>
                <p>
                  Відкрийте PowerShell (Win + X → «Термінал» або «Windows PowerShell») і виконайте
                  команду нижче. WinGet завантажить і зареєструє команди FFmpeg у системі.
                </p>
              </div>
            </div>
            <pre className="ffmpeg-command"><code>winget install ffmpeg</code></pre>
            <p className="ffmpeg-instruction-note">
              WinGet сам розпакує пакет у свою папку та додасть команди до <code>PATH</code>.
              Точний каталог залежить від установки; шукати його вручну не потрібно.
            </p>
            <p className="ffmpeg-instruction-note">
              Після завершення перезапустіть Video Optimus — він перевірить FFmpeg під час запуску.
            </p>
            <p className="ffmpeg-instruction-note">
              Перевірити реєстрацію команд можна в новому PowerShell:{" "}
              <code>where.exe ffmpeg</code> і <code>where.exe ffprobe</code>.
            </p>

            <details className="ffmpeg-advanced">
              <summary>Якщо WinGet недоступний: установити з архіву</summary>
              <ol className="ffmpeg-steps">
                <li>
                  Відкрийте{" "}
                  <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">
                    сторінку завантажень FFmpeg
                  </a>{" "}
                  і перейдіть до Windows builds від gyan.dev. Завантажте{" "}
                  <a
                    href="https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>ffmpeg-release-full.7z</code>
                  </a>
                  . Збірка Full містить програмні кодери для CPU. Якщо Windows не розпаковує{" "}
                  <code>.7z</code>, скористайтеся{" "}
                  <a href="https://www.7-zip.org/" target="_blank" rel="noreferrer">7-Zip</a>.
                </li>
                <li>
                  Розпакуйте архів у постійну папку. У підпапці <code>bin</code> мають бути{" "}
                  <code>ffmpeg.exe</code> і <code>ffprobe.exe</code>; <code>ffplay.exe</code>{" "}
                  програмі не потрібен.
                </li>
                <li>
                  Додайте повний шлях до папки <code>bin</code> у користувацький{" "}
                  <code>Path</code>: натисніть <kbd>Win</kbd> + <kbd>R</kbd>, введіть{" "}
                  <code>sysdm.cpl</code>, відкрийте «Додатково» → «Змінні середовища» →
                  користувацька змінна <code>Path</code> → «Створити».
                </li>
                <li>Підтвердьте зміни та поверніться до Video Optimus для автоматичної перевірки.</li>
              </ol>
              <p className="ffmpeg-build-note">
                Обирайте звичайну збірку <code>full</code>, не{" "}
                <code>full-shared</code>. Архів <code>.tar.xz</code> — це вихідний код.
              </p>
            </details>
          </section>

          <details className="ffmpeg-advanced">
            <summary>Розширений варіант: указати шляхи напряму</summary>
            <p>
              Замість <code>Path</code> створіть дві користувацькі змінні середовища.
              Укажіть повні шляхи до відповідних файлів:
            </p>
            <pre className="ffmpeg-command"><code>VIDEO_OPTIMUS_FFMPEG=C:\шлях\до\bin\ffmpeg.exe{"\n"}VIDEO_OPTIMUS_FFPROBE=C:\шлях\до\bin\ffprobe.exe</code></pre>
            <p>Після збереження змін поверніться до програми — вона перечитає шляхи.</p>
          </details>
        </div>

        <footer className="ffmpeg-dialog-footer">
          <span>Після підключення статус зміниться на «FFmpeg підключено».</span>
          <button className="button button-primary" type="button" onClick={onClose}>
            Зрозуміло
          </button>
        </footer>
      </section>
    </div>
  );
}
