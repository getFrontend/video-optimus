import { useEffect, useState } from "react";
import type {
  AppSettings,
  CompressionMode,
  CustomSettings,
  QualityProfile,
  RuntimeInfo,
} from "../types";
import { shortPath } from "../lib/format";
import { CustomSettingsPanel } from "./CustomSettingsPanel";
import { Icon } from "./Icon";
import { ModeSelect } from "./ModeSelect";
import { QualitySelect } from "./QualitySelect";

export function SettingsPanel({
  settings,
  runtime,
  onMode,
  onQuality,
  onCustomSettings,
  onOutput,
  onTargetSize,
}: {
  settings: AppSettings;
  runtime: RuntimeInfo | null;
  onMode: (mode: CompressionMode) => void;
  onQuality: (quality: QualityProfile) => void;
  onCustomSettings: (settings: CustomSettings) => void;
  onOutput: () => void;
  onTargetSize: (targetSizeBytes: number | null) => void;
}) {
  const [targetSizeInput, setTargetSizeInput] = useState(
    settings.targetSizeBytes == null
      ? ""
      : String(Math.round(settings.targetSizeBytes / 1_000_000)),
  );

  useEffect(() => {
    setTargetSizeInput(
      settings.targetSizeBytes == null
        ? ""
        : String(Math.round(settings.targetSizeBytes / 1_000_000)),
    );
  }, [settings.targetSizeBytes]);

  return (
    <section className="settings-panel">
      <div className="panel-heading settings-drawer-heading">
        <h2>Параметри стиснення</h2>
      </div>
      <p className="settings-preview-note">
        Зміни одразу застосовуються до всіх відео, що очікують обробки. Активне відео не змінюється.
      </p>

      <fieldset className="setting-block">
        <legend className="setting-label" id="mode-setting-label">Режим обробки</legend>
        <ModeSelect
          value={settings.mode}
          onChange={onMode}
          labelledBy="mode-setting-label"
        />
      </fieldset>

      {settings.mode === "custom" && (
        <CustomSettingsPanel
          settings={settings.customSettings}
          runtime={runtime}
          targetSizeBytes={settings.targetSizeBytes}
          onChange={onCustomSettings}
        />
      )}

      <fieldset className="setting-block quality-block">
        <legend className="setting-label" id="quality-setting-label">Якість</legend>
        <QualitySelect
          value={settings.quality}
          onChange={onQuality}
          labelledBy="quality-setting-label"
        />
      </fieldset>

      <div className="setting-block target-size-block">
        <label className="setting-label" htmlFor="target-size-mb">Цільовий розмір</label>
        <div className="target-size-control">
          <input
            id="target-size-mb"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="Без обмеження"
            value={targetSizeInput}
            onChange={(event) => setTargetSizeInput(event.target.value)}
            onBlur={() => {
              const megabytes = Number(targetSizeInput);
              onTargetSize(
                Number.isFinite(megabytes) && megabytes >= 1
                  ? Math.round(megabytes * 1_000_000)
                  : null,
              );
            }}
          />
          <span>МБ</span>
        </div>
        <p className="target-size-note">
          Розмір орієнтовний: кодер може перевищити ціль, а її досягнення може знизити якість.
        </p>
      </div>

      <div className="setting-block output-block">
        <div className="setting-label">Тека результатів</div>
        <button className="output-picker" type="button" onClick={onOutput}>
          <span className="output-icon"><Icon name="folder" size={20} /></span>
          <span className="output-value">
            <strong>{settings.outputDirectory ? "Теку вибрано" : "Як в оригіналу"}</strong>
            <small>{settings.outputDirectory ? shortPath(settings.outputDirectory) : "Назва: _optimized.mp4"}</small>
          </span>
          <Icon name="chevron" size={16} />
        </button>
      </div>
    </section>
  );
}
