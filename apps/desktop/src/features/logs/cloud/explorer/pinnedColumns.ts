// The context fields a person pins as columns beside each Explorer row (Show as column).

/** How many fields may be pinned. */
export const MAX_COLUMNS = 2;

/** `columns` with `key` pinned, or unpinned when it was; the oldest goes past MAX_COLUMNS. */
export const toggledColumn = (columns: readonly string[], key: string) =>
  columns.includes(key) ? columns.filter((k) => k !== key) : [...columns, key].slice(-MAX_COLUMNS);
