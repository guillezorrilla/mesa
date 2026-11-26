// A Cloud Logs entry's columns as the Explorer shows them on every row.

/** Severities whose names do not fit the level badge, shortened. */
const SHORT: Record<string, string> = { EMERGENCY: 'EMERG', CRITICAL: 'CRIT', WARNING: 'WARN' };

/** The badge text for a Cloud Logging severity: every one has one, DEFAULT and NOTICE too. */
export const severityLabel = (severity: string) => SHORT[severity] ?? severity;

/** How many context fields a person may pin as columns beside each row. */
export const MAX_COLUMNS = 2;

/** `columns` with `key` pinned, or unpinned when it was; the oldest goes past MAX_COLUMNS. */
export const toggledColumn = (columns: readonly string[], key: string) =>
  columns.includes(key) ? columns.filter((k) => k !== key) : [...columns, key].slice(-MAX_COLUMNS);
