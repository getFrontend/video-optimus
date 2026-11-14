import type { CompressionMode } from "../types";
import { SettingsSelect } from "./SettingsSelect";
import type { SettingsSelectOption } from "./SettingsSelect";

const MODES: readonly SettingsSelectOption<CompressionMode>[] = [
  { id: "smart", title: "Розумний", hint: "Збалансований вибір", badge: "За замовчуванням" },
  { id: "fast", title: "Швидкий", hint: "Пріоритет швидкості" },
  { id: "maximum", title: "Максимум", hint: "Компактніше, повільніше" },
  { id: "custom", title: "Власний", hint: "Налаштування з’являться пізніше", disabled: true },
];

export function ModeSelect({
  value,
  onChange,
  labelledBy,
}: {
  value: CompressionMode;
  onChange: (mode: CompressionMode) => void;
  labelledBy: string;
}) {
  return (
    <SettingsSelect
      name="compression-mode"
      value={value}
      onChange={onChange}
      labelledBy={labelledBy}
      options={MODES}
    />
  );
}
