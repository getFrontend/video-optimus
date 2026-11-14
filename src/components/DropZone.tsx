import type { ReactNode } from "react";
import UseAnimations from "react-useanimations";
import type { Animation } from "react-useanimations";
import filePlus from "react-useanimations/lib/filePlus";
import film from "react-useanimations/lib/film";
import folder from "react-useanimations/lib/folder";

const FORMATS = ["MP4", "MKV", "MOV", "AVI", "WEBM", "TS"];

export function DropZone({
  available,
  dragging,
  onFiles,
  onFolder,
}: {
  available: boolean;
  dragging: boolean;
  onFiles: () => void;
  onFolder: () => void;
}) {
  return (
    <section
      className={`drop-zone${dragging ? " is-dragging" : ""}`}
      aria-label="Додавання відео"
    >
      <span className="drop-symbol" aria-hidden="true">
        <UseAnimations animation={film} interaction="loop" size={80} />
      </span>
      <div className="drop-copy">
        <h2>{dragging ? "Відпустіть, щоб додати" : "Перетягніть відео сюди"}</h2>
        <p>Додавайте одне відео або кілька файлів одразу. Можна вибрати цілу теку.</p>
        <p>Оригінали не змінюються.</p>
        <ul className="drop-formats" aria-label="Підтримувані формати відео">
          {FORMATS.map((format) => <li key={format}>{format}</li>)}
        </ul>
      </div>
      <div className="drop-actions">
        <AnimatedActionButton
          animation={filePlus}
          className="button button-primary"
          disabled={!available}
          onClick={onFiles}
        >
          Додати файли
        </AnimatedActionButton>
        <AnimatedActionButton
          animation={folder}
          className="button button-secondary drop-folder-button"
          disabled={!available}
          onClick={onFolder}
        >
          Вибрати теку
        </AnimatedActionButton>
      </div>
    </section>
  );
}

function AnimatedActionButton({
  animation,
  className,
  disabled,
  onClick,
  children,
}: {
  animation: Animation;
  className: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <UseAnimations
      animation={animation}
      interaction="hover-replay"
      size={48}
      render={(eventProps, animationProps) => (
        <button
          {...eventProps}
          className={className}
          type="button"
          disabled={disabled}
          onClick={(event) => {
            eventProps.onClick(event);
            onClick();
          }}
        >
          <span {...animationProps} />
          {children}
        </button>
      )}
    />
  );
}
