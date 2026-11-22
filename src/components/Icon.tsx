import type { ReactNode } from "react";

const shapes = {
  arrowDown: <path d="M12 5.5v13m-4.5-4.5 4.5 4.5 4.5-4.5" />,
  arrowLeft: <path d="M5.5 12h13M10 7.5 5.5 12 10 16.5" />,
  arrowRight: <path d="M5.5 12h13M14 7.5l4.5 4.5-4.5 4.5" />,
  arrowUp: <path d="M12 18.5v-13m-4.5 4.5L12 5.5l4.5 4.5" />,
  check: <path d="m6.5 12.5 4 4 7-8" />,
  chevron: <path d="m8.5 6.5 7 5.5-7 5.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 6.8v5.5l3.8 3.2" />
    </>
  ),
  close: <path d="m7 7 10 10M17 7 7 17" />,
  compress: (
    <path d="m9 9-4.2-4.2M9 9H5.6M9 9V5.6m6 3.4 4.2-4.2M15 9h3.4M15 9V5.6M9 15l-4.2 4.2M9 15H5.6M9 15v3.4m6-3.4 4.2 4.2M15 15h3.4M15 15v3.4" />
  ),
  compare: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <path d="M12 4.8v14.4m-3.7-9-1.8 1.8 1.8 1.8m7.4-3.6 1.8 1.8-1.8 1.8" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.2" />
      <path d="M9 2.8V6m3-3.2V6m3-3.2V6M9 18v3.2m3-3.2v3.2m3-3.2v3.2M2.8 9H6m-3.2 3H6m-3.2 3H6M18 9h3.2m-3.2 3h3.2M18 15h3.2" />
    </>
  ),
  film: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="1.8" />
      <path d="M8 3v18m8-18v18M4 8.9h16M4 15.1h16" />
    </>
  ),
  folder: (
    <>
      <path d="M3.2 7.2V5.8A2.8 2.8 0 0 1 6 3h4l2.1 2.2H18a2.8 2.8 0 0 1 2.8 2.8v.3" />
      <path d="M3.2 7.2h16.3a2.5 2.5 0 0 1 2.4 3.2l-1.7 6.8a2.5 2.5 0 0 1-2.4 1.9H5.1a2.5 2.5 0 0 1-2.4-2.6L3.2 7.2Z" />
    </>
  ),
  grip: (
    <>
      <circle cx="9" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  hardDrive: (
    <>
      <path d="M4.6 5.2A2.8 2.8 0 0 1 7.3 3h9.4a2.8 2.8 0 0 1 2.7 2.2l2.4 8.3H2.2l2.4-8.3Z" />
      <rect x="2.2" y="13.5" width="19.6" height="5.5" rx="1.8" />
      <circle cx="18.3" cy="16.25" r=".55" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M12 10.8v5.1" />
      <circle cx="12" cy="7.6" r=".55" fill="currentColor" stroke="none" />
    </>
  ),
  more: (
    <>
      <circle cx="7" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="17" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  maximize: <rect x="5.5" y="5.5" width="13" height="13" />,
  minimize: <path d="M5 12h14" />,
  pause: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="M9.4 8.3v7.4m5.2-7.4v7.4" />
    </>
  ),
  queueRemove: (
    <>
      <path d="M4.5 6.5h8m-8 5h6m-6 5h8" />
      <circle cx="17" cy="14.5" r="4.2" />
      <path d="M15.3 14.5h3.4" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="8.8" />
      <path d="m10 8.1 6.2 3.9-6.2 3.9V8.1Z" />
    </>
  ),
  restore: (
    <>
      <path d="M8 8V5.5h10.5V16H16" />
      <path d="M5.5 8h10.5v10.5H5.5z" />
    </>
  ),
  shield: (
    <path d="M12 2.8c2.2 1.8 4.7 2.9 7.5 3.3v5.1c0 4.5-2.8 8.2-7.5 10-4.7-1.8-7.5-5.5-7.5-10V6.1c2.8-.4 5.3-1.5 7.5-3.3Z" />
  ),
  star: <path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3.2Z" />,
  sparkle: <path d="M12 3.2c.8 4.9 3.1 7.2 8 8-4.9.8-7.2 3.1-8 8-.8-4.9-3.1-7.2-8-8 4.9-.8 7.2-3.1 8-8Z" />,
  trash: (
    <path d="M8 8.5h8M10 8.5V7.2c0-.6.4-1 1-1h2c.6 0 1 .4 1 1v1.3M9 8.5l.6 8.5c.05.6.5 1 1.1 1h2.6c.6 0 1.05-.4 1.1-1l.6-8.5M11.4 11v4.5m1.2-4.5v4.5" />
  ),
  warning: (
    <>
      <path d="m10.3 4.3-7.5 13a2.1 2.1 0 0 0 1.8 3.1h15a2.1 2.1 0 0 0 1.8-3.1l-7.5-13a2.1 2.1 0 0 0-3.6 0Z" />
      <path d="M12 8.6v4.8" />
      <circle cx="12" cy="16.7" r=".55" fill="currentColor" stroke="none" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="M16 9a4.2 4.2 0 0 1 0 6m2.4-8.4a7.5 7.5 0 0 1 0 10.8" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      <path d="m17 9 4 6m0-6-4 6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof shapes;

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes[name]}
    </svg>
  );
}
