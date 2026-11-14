import type { AppSettings, CompressionMode, QualityProfile } from "../types";
import { shortPath } from "../lib/format";
import { Icon } from "./Icon";
import { ModeSelect } from "./ModeSelect";
import { QualitySelect } from "./QualitySelect";

export function SettingsPanel({
  settings,
  onMode,
  onQuality,
  onOutput,
}: {
  settings: AppSettings;
  onMode: (mode: CompressionMode) => void;
  onQuality: (quality: QualityProfile) => void;
  onOutput: () => void;
}) {
  return (
    <section className="settings-panel">
      <div className="panel-heading settings-drawer-heading">
        <h2>Параметри стиснення</h2>
      </div>

      <fieldset className="setting-block">
        <legend className="setting-label" id="mode-setting-label">Режим обробки</legend>
        <ModeSelect
          value={settings.mode}
          onChange={onMode}
          labelledBy="mode-setting-label"
        />
      </fieldset>

      <fieldset className="setting-block quality-block">
        <legend className="setting-label" id="quality-setting-label">Якість</legend>
        <QualitySelect
          value={settings.quality}
          onChange={onQuality}
          labelledBy="quality-setting-label"
        />
      </fieldset>

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
