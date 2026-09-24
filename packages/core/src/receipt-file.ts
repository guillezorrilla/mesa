import { ULID_PATTERN } from './ids.js';

export const RECEIPT_TYPES = ['session', 'skill', 'decision', 'action'] as const;

/** `<started, compact>-<type>-<id>.md`: the only file name a receipt has. */
export const RECEIPT_FILE = new RegExp(
  `^(\\d{8}T\\d{6}Z)-(${RECEIPT_TYPES.join('|')})-(${ULID_PATTERN})\\.md$`,
);

/** `receipts/YYYY/MM/<file>`, from the receipt's start time, type, and id. */
export function receiptPath(r: { started: string; type: string; id: string }): string {
  const [year, month] = r.started.split('-');
  const stamp = r.started.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `receipts/${year}/${month}/${stamp}-${r.type}-${r.id}.md`;
}

/**
 * Newest first by start time, then by id: a ULID starts with its millisecond time, so it orders
 * receipts within the same second. Undefined for a name that is not a receipt's.
 */
export function receiptSortKey(file: string): string | undefined {
  const match = file.match(RECEIPT_FILE);
  return match ? `${match[1]}-${match[3]}` : undefined;
}
