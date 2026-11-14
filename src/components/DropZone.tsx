import { Icon } from "./Icon";

const FORMATS = ["MP4", "MKV", "MOV", "AVI", "WEBM", "TS"];

export function DropZone({
  available,
  dragging,
  empty,
  onFiles,
  onFolder,
}: {
  available: boolean;
  dragging: boolean;
  empty: boolean;
  onFiles: () => void;
  onFolder: () => void;
}) {
  return (
    <section
      className={`drop-zone${dragging ? " is-dragging" : ""}${empty ? " is-empty" : ""}`}
      aria-label="Додавання відео"
    >
      <span className="drop-symbol" aria-hidden="true"><Icon name="film" size={24} /></span>
      <div className="drop-copy">
        <h2>{dragging ? "Відпустіть, щоб додати" : "Перетягніть відео сюди"}</h2>
        <p>Додавайте одне відео або кілька файлів одразу. Можна вибрати цілу теку. Оригінали не змінюються.</p>
        <ul className="drop-formats" aria-label="Підтримувані формати відео">
          {FORMATS.map((format) => <li key={format}>{format}</li>)}
        </ul>
      </div>
      <div className="drop-actions">
        <button className="button button-primary" type="button" disabled={!available} onClick={onFiles}>
          <Icon name="add" size={empty ? 32 : 16} />
          Додати файли
        </button>
        <button className="button button-secondary" type="button" disabled={!available} onClick={onFolder}>
          <Icon name="folder" size={empty ? 32 : 16} />
          Вибрати теку
        </button>
      </div>
    </section>
  );
}
