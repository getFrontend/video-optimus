import type { JobStatus } from "../types";

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString("uk-UA", {
    maximumFractionDigits: unit < 2 ? 0 : 1,
  })} ${units[unit]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatFrameRate(value: string): string {
  const [numerator, denominator] = value.split("/").map(Number);
  if (!numerator || !denominator) return value === "unknown" ? "—" : value;
  return `${(numerator / denominator).toLocaleString("uk-UA", {
    maximumFractionDigits: 2,
  })} кадр/с`;
}

export function statusLabel(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    pending: "У черзі",
    analyzing: "Аналіз",
    preparing: "Підготовка",
    encoding: "Стиснення",
    validating: "Перевірка",
    completed: "Готово",
    failed: "Помилка",
    cancelled: "Скасовано",
    skipped: "Пропущено",
    interrupted: "Перервано",
  };
  return labels[status];
}

export function shortPath(value: string | null | undefined): string {
  return value?.replaceAll("\\", "/").split("/").slice(-2).join("/") ?? "";
}
