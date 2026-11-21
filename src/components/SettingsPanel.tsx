import { useEffect, useState } from "react";
import UseAnimations from "react-useanimations";
import settings2 from "react-useanimations/lib/settings2";
import user from "react-useanimations/lib/user";
import type {
  AppSettings,
  CompressionMode,
  CustomSettings,
  QualityProfile,
} from "../types";
import { shortPath } from "../lib/format";
import { Icon } from "./Icon";
import { ModeSelect } from "./ModeSelect";
import { QualitySelect } from "./QualitySelect";

const CUSTOM_CODEC_LABELS: Record<CustomSettings["codec"], string> = {
  h264: "H.264 / AVC",
  hevc: "HEVC / H.265",
  av1: "AV1",
};

const CUSTOM_DEVICE_LABELS: Record<CustomSettings["device"], string> = {
  auto: "QSV / CPU",
  cpu: "CPU",
  qsv: "Intel QSV",
};

const CUSTOM_CONTAINER_LABELS: Record<CustomSettings["container"], string> = {
  auto: "Контейнер авто",
  mp4: "MP4",
  mkv: "MKV",
};

const CUSTOM_PRESET_LABELS: Record<CustomSettings["preset"], string> = {
  fast: "Швидкий",
  balanced: "Збалансований",
  quality: "Якісний",
};

function CustomSettingsSummary({
  settings,
  onOpen,
}: {
  settings: CustomSettings;
  onOpen: () => void;
}) {
  const [active, setActive] = useState(false);

  return (
    <button
      className="custom-settings-summary"
      type="button"
      aria-label="Змінити параметри режиму Власний"
      aria-haspopup="dialog"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onClick={onOpen}
    >
      <UseAnimations
        animation={user}
        interaction="click-toggle"
        active={active}
        size={27}
        className="custom-settings-user-icon"
        aria-hidden="true"
      />
      <span className="custom-settings-summary-copy">
        <strong>{CUSTOM_CODEC_LABELS[settings.codec]}</strong>
        <small>
          {[
            CUSTOM_DEVICE_LABELS[settings.device],
            CUSTOM_PRESET_LABELS[settings.preset],
            CUSTOM_CONTAINER_LABELS[settings.container],
            settings.audioCodec === "aac" ? "AAC" : "Аудіо оригіналу",
          ].join(" · ")}
        </small>
      </span>
      <UseAnimations
        animation={settings2}
        interaction="click-toggle"
        active={active}
        size={36}
        className="custom-settings-summary-icon"
        aria-hidden="true"
      />
    </button>
  );
}

export function SettingsPanel({
  settings,
  onMode,
  onOpenCustomSettings,
  onQuality,
  onOutput,
  outputDisabled,
  onTargetSize,
}: {
  settings: AppSettings;
  onMode: (mode: CompressionMode) => void;
  onOpenCustomSettings: () => void;
  onQuality: (quality: QualityProfile) => void;
  onOutput: () => void;
  outputDisabled: boolean;
  onTargetSize: (targetSizeBytes: number | null) => void;
}) {
  const [targetSizeEnabled, setTargetSizeEnabled] = useState(
    settings.targetSizeBytes != null,
  );
  const [targetSizeToggleInteracted, setTargetSizeToggleInteracted] =
    useState(false);
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
    if (!targetSizeToggleInteracted) {
      setTargetSizeEnabled(settings.targetSizeBytes != null);
    }
  }, [settings.targetSizeBytes, targetSizeToggleInteracted]);

  return (
    <section className="settings-panel">
      <div className="panel-heading settings-drawer-heading">
        <h2>Налаштування</h2>
      </div>
      <p className="settings-preview-note">
        Зміни одразу застосовуються до всіх відео, що очікують обробки. Активне відео не змінюється.
      </p>

      <fieldset className="setting-block">
        <legend className="setting-label" id="mode-setting-label">Режим обробки</legend>
        <ModeSelect
          value={settings.mode}
          onChange={(mode) => {
            onMode(mode);
            if (mode === "custom") onOpenCustomSettings();
          }}
          labelledBy="mode-setting-label"
        />
      </fieldset>

      {settings.mode === "custom" && (
        <CustomSettingsSummary
          settings={settings.customSettings}
          onOpen={onOpenCustomSettings}
        />
      )}

      <div className="settings-divider" aria-hidden="true" />

      <fieldset className="setting-block quality-block">
        <legend className="setting-label" id="quality-setting-label">Якість</legend>
        <QualitySelect
          value={settings.quality}
          onChange={onQuality}
          labelledBy="quality-setting-label"
        />
      </fieldset>

      <div className="setting-block target-size-block">
        <div className="target-size-heading">
          <span className="setting-label" id="target-size-label">Цільовий розмір</span>
          <button
            aria-checked={targetSizeEnabled}
            aria-labelledby="target-size-label"
            className={`target-size-toggle t-toggle${targetSizeToggleInteracted ? " is-init" : ""}`}
            data-on={String(targetSizeEnabled)}
            onClick={() => {
              const nextEnabled = !targetSizeEnabled;
              setTargetSizeToggleInteracted(true);
              setTargetSizeEnabled(nextEnabled);
              if (!nextEnabled) onTargetSize(null);
            }}
            role="switch"
            type="button"
          >
            <span className="t-toggle-thumb" />
          </button>
        </div>
        <div
          aria-hidden={!targetSizeEnabled}
          className="target-size-panel"
          data-open={String(targetSizeEnabled)}
          inert={!targetSizeEnabled}
        >
          <div className="target-size-panel-inner">
            <label className="visually-hidden" htmlFor="target-size-mb">
              Цільовий розмір у мегабайтах
            </label>
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
              Ціль має пріоритет над профілем якості й ручним бітрейтом. Кодер може перевищити її, а досягнення цілі може знизити якість.
            </p>
          </div>
        </div>
      </div>

      <div className="setting-block output-block">
        <div className="setting-label">Тека результатів</div>
        <button
          className="output-picker"
          type="button"
          disabled={outputDisabled}
          onClick={onOutput}
        >
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
