import type { KeyboardEvent, ReactNode } from "react";
import { useRef } from "react";

export function ComparisonWipe({
  split,
  onSplit,
  aspectRatio,
  width,
  children,
  overlay,
}: {
  split: number;
  onSplit: (value: number) => void;
  aspectRatio: number;
  width: string;
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = (clientX: number) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    onSplit(Math.min(100, Math.max(0, ((clientX - bounds.left) / bounds.width) * 100)));
  };

  const updateFromKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      onSplit(Math.max(0, split - step));
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      onSplit(Math.min(100, split + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      onSplit(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onSplit(100);
    }
  };

  return (
    <div
      ref={stageRef}
      className="comparison-stage"
      style={{ aspectRatio: `${aspectRatio}`, width }}
      aria-label="Відео для порівняння"
    >
      {children}
      <div
        className="comparison-split-hitarea"
        role="slider"
        tabIndex={0}
        aria-label="Положення межі порівняння"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split)}
        aria-valuetext={`Оригінал ${Math.round(split)}%, оптимізоване відео ${Math.round(100 - split)}%`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event.clientX);
          }
        }}
        onKeyDown={updateFromKey}
      />
      {split > 5 && (
        <div className="comparison-side-label comparison-side-label--original" aria-hidden="true">
          <span>ОРИГІНАЛ</span>
        </div>
      )}
      {split < 95 && (
        <div className="comparison-side-label comparison-side-label--optimized" aria-hidden="true">
          <span>ОПТИМІЗОВАНО</span>
        </div>
      )}
      <div className="comparison-divider" style={{ left: `${split}%` }} aria-hidden="true">
        {split > 2 && split < 98 && (
          <span className="comparison-divider-handle">
            <i />
            <i />
          </span>
        )}
      </div>
      {overlay}
    </div>
  );
}
