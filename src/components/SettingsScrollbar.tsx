import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

type ScrollMetrics = {
  max: number;
  scrollTop: number;
  thumbSize: number;
  thumbTop: number;
};

const INITIAL_METRICS: ScrollMetrics = {
  max: 0,
  scrollTop: 0,
  thumbSize: 100,
  thumbTop: 0,
};

export function SettingsScrollbar({
  viewportRef,
  viewportId,
}: {
  viewportRef: RefObject<HTMLDivElement | null>;
  viewportId: string;
}) {
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const dragStart = useRef<{ y: number; scrollTop: number } | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const update = () => {
      const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const thumbSize = max === 0
        ? 100
        : Math.min(100, Math.max(24 / viewport.clientHeight * 100, viewport.clientHeight / viewport.scrollHeight * 100));
      const thumbTop = max === 0 ? 0 : viewport.scrollTop / max * (100 - thumbSize);

      setMetrics((current) => {
        if (
          current.max === max &&
          current.scrollTop === viewport.scrollTop &&
          current.thumbSize === thumbSize &&
          current.thumbTop === thumbTop
        ) return current;
        return { max, scrollTop: viewport.scrollTop, thumbSize, thumbTop };
      });
    };

    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener("scroll", update, { passive: true });
    update();

    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", update);
    };
  }, [viewportRef]);

  if (metrics.max === 0) return null;

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (event.target === event.currentTarget) {
      const track = event.currentTarget.getBoundingClientRect();
      const thumbHeight = event.currentTarget.clientHeight * metrics.thumbSize / 100;
      const thumbTop = Math.min(
        Math.max(0, event.clientY - track.top - thumbHeight / 2),
        track.height - thumbHeight,
      );
      viewport.scrollTop = thumbTop / Math.max(1, track.height - thumbHeight) * metrics.max;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { y: event.clientY, scrollTop: viewport.scrollTop };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !dragStart.current) return;

    const thumbTravel = event.currentTarget.clientHeight * (1 - metrics.thumbSize / 100);
    const scrollDelta = (event.clientY - dragStart.current.y) / Math.max(1, thumbTravel) * metrics.max;
    viewport.scrollTop = dragStart.current.scrollTop + scrollDelta;
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const page = viewport.clientHeight * 0.8;
    const step = 40;
    const destinations: Record<string, number> = {
      ArrowDown: viewport.scrollTop + step,
      ArrowUp: viewport.scrollTop - step,
      PageDown: viewport.scrollTop + page,
      PageUp: viewport.scrollTop - page,
      Home: 0,
      End: metrics.max,
    };
    const destination = destinations[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    viewport.scrollTop = destination;
  };

  return (
    <div
      className="settings-scrollbar"
      role="scrollbar"
      aria-label="Прокрутка параметрів стиснення"
      aria-controls={viewportId}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.round(metrics.max)}
      aria-valuenow={Math.round(metrics.scrollTop)}
      aria-valuetext={`${Math.round(metrics.scrollTop / metrics.max * 100)}%`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <span
        className="settings-scrollbar-thumb"
        style={{ top: `${metrics.thumbTop}%`, height: `${metrics.thumbSize}%` }}
      />
    </div>
  );
}
