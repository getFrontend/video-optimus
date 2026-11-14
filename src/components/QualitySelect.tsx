import type { QualityProfile } from "../types";
import { SettingsSelect } from "./SettingsSelect";
import type { SettingsSelectOption } from "./SettingsSelect";

const PROFILES: readonly SettingsSelectOption<QualityProfile>[] = [
  { id: "near_original", title: "Майже оригінал", hint: "Зберегти максимум деталей" },
  { id: "high", title: "Висока", hint: "Чітке зображення" },
  { id: "balanced", title: "Збалансована", hint: "Якість і розмір" },
  { id: "compact", title: "Компактна", hint: "Менший розмір файлу" },
];

export function QualitySelect({
  value,
  onChange,
  labelledBy,
}: {
  value: QualityProfile;
  onChange: (quality: QualityProfile) => void;
  labelledBy: string;
}) {
  return (
    <SettingsSelect
      name="quality-profile"
      value={value}
      onChange={onChange}
      labelledBy={labelledBy}
      options={PROFILES}
    />
  );
}
