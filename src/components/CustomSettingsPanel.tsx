import { useEffect, useId, useState } from "react";
import type {
  CustomAudioCodec,
  CustomDevice,
  CustomPreset,
  CustomSettings,
  CustomVideoCodec,
  OutputContainer,
  RuntimeInfo,
} from "../types";
import { SettingsSelect } from "./SettingsSelect";
import type { SettingsSelectOption } from "./SettingsSelect";

const CODECS: readonly {
  id: CustomVideoCodec;
  title: string;
  cpuEncoder: string;
  qsvEncoder: string;
}[] = [
  { id: "h264", title: "H.264 / AVC", cpuEncoder: "libx264", qsvEncoder: "h264_qsv" },
  { id: "hevc", title: "HEVC / H.265", cpuEncoder: "libx265", qsvEncoder: "hevc_qsv" },
  { id: "av1", title: "AV1", cpuEncoder: "libsvtav1", qsvEncoder: "av1_qsv" },
];

const PRESETS: readonly SettingsSelectOption<CustomPreset>[] = [
  { id: "fast", title: "Швидкий", hint: "Менший час обробки" },
  { id: "balanced", title: "Збалансований", hint: "Баланс швидкості та стискання" },
  { id: "quality", title: "Якісний", hint: "Повільніше, ефективніше стискання" },
];

const CONTAINERS: readonly SettingsSelectOption<OutputContainer>[] = [
  { id: "auto", title: "Автоматично", hint: "Зберегти сумісність потоків" },
  { id: "mp4", title: "MP4", hint: "Поширена сумісність" },
  { id: "mkv", title: "MKV", hint: "Підтримка додаткових потоків" },
];

const AUDIO_CODECS: readonly SettingsSelectOption<CustomAudioCodec>[] = [
  {
    id: "copy",
    title: "Як в оригіналі",
    hint: "Без повторного кодування; несумісний потік може бути переведений в AAC",
  },
  { id: "aac", title: "AAC", hint: "Сумісний формат із вибраним бітрейтом" },
];

const AUDIO_BITRATES = [96, 128, 160, 192, 256, 320] as const;
type AudioBitrate = `${(typeof AUDIO_BITRATES)[number]}`;

const AUDIO_BITRATE_OPTIONS: readonly SettingsSelectOption<AudioBitrate>[] =
  AUDIO_BITRATES.map((bitrate) => ({
    id: `${bitrate}` as AudioBitrate,
    title: `${bitrate} кбіт/с`,
    hint: bitrate <= 128 ? "Менший розмір" : bitrate >= 256 ? "Вищий бітрейт" : "Збалансований бітрейт",
  }));

export function CustomSettingsPanel({
  settings,
  runtime,
  targetSizeBytes,
  popoverContainer,
  showHeading = true,
  onChange,
}: {
  settings: CustomSettings;
  runtime: RuntimeInfo | null;
  targetSizeBytes: number | null;
  popoverContainer?: HTMLElement | null;
  showHeading?: boolean;
  onChange: (settings: CustomSettings) => void;
}) {
  const id = useId();
  const [videoBitrateInput, setVideoBitrateInput] = useState(
    settings.videoBitrateKbps == null ? "" : String(settings.videoBitrateKbps),
  );
  const capabilitiesKnown = runtime?.ready === true;
  const codec = CODECS.find((option) => option.id === settings.codec) ?? CODECS[0];
  const cpuAvailable = isEncoderAvailable(runtime, codec.cpuEncoder);
  const qsvAvailable = isEncoderAvailable(runtime, codec.qsvEncoder);
  const deviceOptions: readonly SettingsSelectOption<CustomDevice>[] = [
    {
      id: "auto",
      title: "Автоматично",
      hint: "QSV, якщо доступний; інакше CPU",
      disabled: capabilitiesKnown && !cpuAvailable && !qsvAvailable,
    },
    {
      id: "cpu",
      title: "CPU",
      hint: codec.cpuEncoder,
      disabled: capabilitiesKnown && !cpuAvailable,
    },
    {
      id: "qsv",
      title: "Intel QSV",
      hint: `${codec.qsvEncoder}; перехід на CPU, якщо QSV не запуститься`,
      disabled: capabilitiesKnown && !qsvAvailable,
    },
  ];
  const codecOptions: readonly SettingsSelectOption<CustomVideoCodec>[] = CODECS.map((option) => {
    const cpu = isEncoderAvailable(runtime, option.cpuEncoder);
    const qsv = isEncoderAvailable(runtime, option.qsvEncoder);
    const available = !capabilitiesKnown
      || (settings.device === "cpu" ? cpu : settings.device === "qsv" ? qsv : cpu || qsv);
    return {
      id: option.id,
      title: option.title,
      hint: available ? "Доступний вибраний тип кодування" : "Немає сумісного доступного енкодера",
      disabled: !available,
    };
  });
  const selectedEncoder = settings.device === "cpu"
    ? codec.cpuEncoder
    : settings.device === "qsv"
      ? codec.qsvEncoder
      : qsvAvailable ? codec.qsvEncoder : codec.cpuEncoder;
  const selectedEncoderInfo = runtime?.encoders.find((encoder) => encoder.name === selectedEncoder);
  const presetAvailable = !capabilitiesKnown
    || Boolean(selectedEncoderInfo?.available && selectedEncoderInfo.supportedOptions.includes("preset"));

  useEffect(() => {
    setVideoBitrateInput(
      settings.videoBitrateKbps == null ? "" : String(settings.videoBitrateKbps),
    );
  }, [settings.videoBitrateKbps]);

  const update = <Key extends keyof CustomSettings>(key: Key, value: CustomSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <section
      className="custom-settings-panel"
      aria-labelledby={showHeading ? `${id}-heading` : "custom-settings-dialog-title"}
    >
      {showHeading && <h3 id={`${id}-heading`}>Налаштування Custom</h3>}
      {capabilitiesKnown && !codecOptions.some((option) => !option.disabled) && (
        <p className="custom-settings-note is-warning">
          Для вибраних параметрів не знайдено доступного енкодера.
        </p>
      )}

      <fieldset className="setting-block custom-setting-block">
        <legend className="setting-label" id={`${id}-codec-label`}>Відеокодек</legend>
        <SettingsSelect
          name={`${id}-codec`}
          value={settings.codec}
          options={codecOptions}
          labelledBy={`${id}-codec-label`}
          popoverContainer={popoverContainer}
          onChange={(codecValue) => update("codec", codecValue)}
        />
      </fieldset>

      <fieldset className="setting-block custom-setting-block">
        <legend className="setting-label" id={`${id}-device-label`}>Спосіб кодування</legend>
        <SettingsSelect
          name={`${id}-device`}
          value={settings.device}
          options={deviceOptions}
          labelledBy={`${id}-device-label`}
          popoverContainer={popoverContainer}
          onChange={(device) => update("device", device)}
        />
      </fieldset>

      <fieldset className="setting-block custom-setting-block">
        <legend className="setting-label" id={`${id}-preset-label`}>Пресет швидкості</legend>
        <SettingsSelect
          name={`${id}-preset`}
          value={settings.preset}
          options={PRESETS.map((option) => ({ ...option, disabled: !presetAvailable }))}
          labelledBy={`${id}-preset-label`}
          popoverContainer={popoverContainer}
          onChange={(preset) => update("preset", preset)}
        />
        {!presetAvailable && (
          <p className="custom-settings-note">
            Вибраний енкодер не підтримує налаштування пресета.
          </p>
        )}
      </fieldset>

      <fieldset className="setting-block custom-setting-block">
        <legend className="setting-label" id={`${id}-container-label`}>Контейнер</legend>
        <SettingsSelect
          name={`${id}-container`}
          value={settings.container}
          options={CONTAINERS}
          labelledBy={`${id}-container-label`}
          popoverContainer={popoverContainer}
          onChange={(container) => update("container", container)}
        />
        {settings.container === "mp4" && (
          <p className="custom-settings-note">
            Файли з вкладеннями або несумісними субтитрами потребуватимуть MKV.
          </p>
        )}
      </fieldset>

      <fieldset className="setting-block custom-setting-block">
        <legend className="setting-label" id={`${id}-audio-codec-label`}>Аудіокодек</legend>
        <SettingsSelect
          name={`${id}-audio-codec`}
          value={settings.audioCodec}
          options={AUDIO_CODECS}
          labelledBy={`${id}-audio-codec-label`}
          popoverContainer={popoverContainer}
          onChange={(audioCodec) => update("audioCodec", audioCodec)}
        />
      </fieldset>

      {settings.audioCodec === "aac" && (
        <fieldset className="setting-block custom-setting-block">
          <legend className="setting-label" id={`${id}-audio-bitrate-label`}>Бітрейт аудіо</legend>
          <SettingsSelect
            name={`${id}-audio-bitrate`}
            value={`${settings.audioBitrateKbps}` as AudioBitrate}
            options={AUDIO_BITRATE_OPTIONS}
            labelledBy={`${id}-audio-bitrate-label`}
            popoverContainer={popoverContainer}
            onChange={(bitrate) => update("audioBitrateKbps", Number(bitrate))}
          />
        </fieldset>
      )}

      <div className="setting-block custom-setting-block custom-video-bitrate-block">
        <label className="setting-label" htmlFor={`${id}-video-bitrate`}>
          Бітрейт відео, кбіт/с
        </label>
        <input
          className="custom-bitrate-input"
          id={`${id}-video-bitrate`}
          type="number"
          min="100"
          max="100000"
          step="100"
          inputMode="numeric"
          placeholder="За профілем якості"
          value={videoBitrateInput}
          disabled={targetSizeBytes != null}
          onChange={(event) => setVideoBitrateInput(event.target.value)}
          onBlur={() => {
            if (targetSizeBytes != null) return;
            const value = videoBitrateInput.trim() === "" ? null : Number(videoBitrateInput);
            if (value != null && (!Number.isInteger(value) || value < 100 || value > 100_000)) {
              setVideoBitrateInput(
                settings.videoBitrateKbps == null ? "" : String(settings.videoBitrateKbps),
              );
              return;
            }
            if (value !== settings.videoBitrateKbps) update("videoBitrateKbps", value);
          }}
          aria-describedby={`${id}-video-bitrate-note`}
        />
        <p className="custom-settings-note" id={`${id}-video-bitrate-note`}>
          {targetSizeBytes != null
            ? "Цільовий розмір має пріоритет над ручним бітрейтом і профілем якості."
            : settings.videoBitrateKbps == null
              ? "Порожнє поле використовує профіль якості; прогноз враховує кодек, пристрій, пресет і аудіо."
              : "Ручний бітрейт задає середній бітрейт відео й орієнтовний розмір, має пріоритет над профілем; кодек і пресет впливають на якість та швидкість."}
        </p>
      </div>

      {runtime && !runtime.ready && (
        <p className="custom-settings-note">
          Доступність кодеків буде перевірена після налаштування FFmpeg.
        </p>
      )}
    </section>
  );
}

function isEncoderAvailable(runtime: RuntimeInfo | null, name: string): boolean {
  if (!runtime?.ready) return true;
  return runtime.encoders.some((encoder) => encoder.name === name && encoder.available);
}
