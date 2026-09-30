import { ULID_PATTERN } from '../lib/ids.js';
import { VAULT } from '../vault/layout.js';
import { wikilink } from '../vault/links.js';

export const RECEIPT_TYPES = ['session', 'skill', 'decision', 'action'] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

/** `<started, compact>-<type>-<id>.md`: the only file name a receipt has. */
export const RECEIPT_FILE = new RegExp(
  `^(\\d{8}T\\d{6}Z)-(${RECEIPT_TYPES.join('|')})-(${ULID_PATTERN})\\.md$`,
);

/**
 * `receipts/YYYY/MM/<file>`, from the receipt's start time (in UTC, whichever form `started` is
 * written in: a zone-less local time parses as local), its type, and its id.
 */
export function receiptPath(r: { started: string; type: string; id: string }): string {
  const utc = new Date(r.started).toISOString();
  const [year, month] = utc.split('-');
  const stamp = utc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${VAULT.receipts}/${year}/${month}/${stamp}-${r.type}-${r.id}.md`;
}

/** The wikilink a log.md line uses to point at a receipt (docs/receipts.md). */
export const receiptLink = (path: string) => wikilink(path, 'receipt');

/**
 * What a receipt's file name says: its type, and its sort `key`, newest first by start time, then
 * by id (a ULID starts with its millisecond time, so it orders receipts within the same second).
 * Undefined for a name that is not a receipt's.
 */
export function receiptName(file: string): { key: string; type: ReceiptType } | undefined {
  const match = file.match(RECEIPT_FILE);
  return match ? { key: `${match[1]}-${match[3]}`, type: match[2] as ReceiptType } : undefined;
}
