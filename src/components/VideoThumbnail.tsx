import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import visibility2 from "react-useanimations/lib/visibility2";
import {
  getVideoThumbnail,
  invalidateVideoThumbnail,
} from "../lib/videoThumbnails";
import { AnimatedIcon } from "./AnimatedIcon";
import { Icon } from "./Icon";

export function VideoThumbnail({
  jobId,
  fileName,
  codec,
  skipped,
  onPlay,
}: {
  jobId: string;
  fileName: string;
  codec: string;
  skipped: boolean;
  onPlay: () => void;
}) {
  const containerRef = useRef<HTMLButtonElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "180px" });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;
    let mounted = true;
    void getVideoThumbnail(jobId).then((thumbnail) => {
      if (mounted) setPreview(thumbnail);
    });
    return () => {
      mounted = false;
    };
  }, [jobId, shouldLoad]);

  return (
    <button
      className={`file-mark thumbnail-button codec-${codec}${skipped ? " is-skipped" : ""}`}
      type="button"
      aria-label={skipped
        ? `Відео пропущено: ${fileName}. Поверніть його в чергу, щоб відтворити.`
        : `Відтворити відео: ${fileName}`}
      title={skipped
        ? "Поверніть відео в чергу, щоб відтворити."
        : `Відтворити відео: ${fileName}`}
      disabled={!isTauri() || skipped}
      onClick={onPlay}
      ref={containerRef}
    >
      {preview && !failed ? (
        <img
          className="queue-thumbnail"
          src={preview}
          alt=""
          onError={() => {
            invalidateVideoThumbnail(jobId);
            setFailed(true);
          }}
        />
      ) : (
        <Icon name="film" size={24} />
      )}
      <span className="thumbnail-play-badge">
        <Icon name="play" size={14} />
      </span>
      {skipped && (
        <span className="thumbnail-skip-overlay" aria-hidden="true">
          <AnimatedIcon
            animation={visibility2}
            interaction="click-toggle"
            active
            size={42}
          />
        </span>
      )}
    </button>
  );
}
