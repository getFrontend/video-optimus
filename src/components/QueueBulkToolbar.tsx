export function QueueBulkToolbar({
  selectedCount,
  pendingCount,
  retryableCount,
  onApplySettings,
  onRetry,
  onClear,
}: {
  selectedCount: number;
  pendingCount: number;
  retryableCount: number;
  onApplySettings: () => void;
  onRetry: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="bulk-toolbar" role="toolbar" aria-label="Групові дії з чергою">
      <span className="bulk-selection-count">Вибрано: {selectedCount}</span>
      <button
        className="button button-secondary"
        type="button"
        disabled={pendingCount === 0}
        onClick={onApplySettings}
      >
        Застосувати поточні параметри
      </button>
      <button
        className="button button-quiet"
        type="button"
        disabled={retryableCount === 0}
        onClick={onRetry}
      >
        Повторити невдалі
      </button>
      <button className="button button-quiet" type="button" onClick={onClear}>
        Зняти вибір
      </button>
    </div>
  );
}
