export function QueueBulkToolbar({
  selectedCount,
  onClear,
}: {
  selectedCount: number;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="bulk-toolbar" role="toolbar" aria-label="Групові дії з чергою">
      <span className="bulk-selection-count">Вибрано: {selectedCount}</span>
      <button
        className="button button-secondary bulk-clear-selection"
        type="button"
        onClick={onClear}
      >
        Зняти вибір
      </button>
    </div>
  );
}
