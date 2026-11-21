import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import UseAnimations from "react-useanimations";
import type { Animation } from "react-useanimations";
import filePlus from "react-useanimations/lib/filePlus";
import film from "react-useanimations/lib/film";
import folder from "react-useanimations/lib/folder";
import { useAdaptiveButtonScale } from "../hooks/useAdaptiveButtonScale";

const FORMATS = ["MP4", "MKV", "MOV", "AVI", "WEBM", "TS"];

export function DropZone({
  animateEntrance,
  available,
  dragging,
  onFiles,
  onFolder,
}: {
  animateEntrance: boolean;
  available: boolean;
  dragging: boolean;
  onFiles: () => void;
  onFolder: () => void;
}) {
  const dropZoneRef = useRef<HTMLElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [shouldAnimateEntrance] = useState(animateEntrance);
  const { button: buttonScale, content: contentScale } = useAdaptiveButtonScale(
    dropZoneRef,
    actionsRef,
  );

  return (
    <section
      ref={dropZoneRef}
      className={`drop-zone${dragging ? " is-dragging" : ""}${shouldAnimateEntrance ? " is-entering" : ""}`}
      style={{
        "--drop-action-scale": buttonScale,
        "--drop-content-scale": contentScale,
      } as CSSProperties}
      aria-label="Додавання відео"
    >
      <span className="drop-symbol" aria-hidden="true">
        <UseAnimations
          animation={film}
          interaction="loop"
          size={Math.round(80 * contentScale)}
        />
      </span>
      <div className="drop-copy">
        <h2>{dragging ? "Відпустіть, щоб додати" : "Перетягніть відео сюди"}</h2>
        <p>Додавайте одне відео або кілька файлів одразу. Можна вибрати цілу теку.</p>
        <p>Оригінали не змінюються.</p>
        <ul className="drop-formats" aria-label="Підтримувані формати відео">
          {FORMATS.map((format) => <li key={format}>{format}</li>)}
        </ul>
      </div>
      <div className="drop-actions" ref={actionsRef}>
        <AnimatedActionButton
          animation={filePlus}
          iconSize={Math.max(24, Math.round(48 * buttonScale))}
          className="button button-primary"
          disabled={!available}
          onClick={onFiles}
        >
          Додати файли
        </AnimatedActionButton>
        <AnimatedActionButton
          animation={folder}
          iconSize={Math.max(24, Math.round(48 * buttonScale))}
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
  iconSize,
  className,
  disabled,
  onClick,
  children,
}: {
  animation: Animation;
  iconSize: number;
  className: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <UseAnimations
      animation={animation}
      interaction="hover-replay"
      size={iconSize}
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
