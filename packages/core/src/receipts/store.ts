import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Clock } from '../lib/clock.js';
import type { IdSource } from '../lib/ids.js';
import { MesaError, toFail } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { obsidianDateTime } from '../lib/time.js';
import { VAULT } from '../vault/layout.js';
import {
  appendLog,
  type LockedNotesDeps,
  ownFields,
  readNote,
  updateNote,
  writeNote,
} from '../vault/notes.js';
import { receiptLink, receiptPath, receiptSortKey } from './receipt-file.js';
import { type Receipt, type ReceiptInput, ReceiptSchema } from './schema.js';

// Receipts in the vault's receipts/: written, closed, listed, and read back (docs/receipts.md).

type ReceiptsDeps = { vault: string; clock: Clock; newId: IdSource };

export const DEFAULT_RECEIPT_LIMIT = 20;

/**
 * Validates and writes one receipt through writeNote, so it is atomic like every Mesa note, then
 * appends a log.md line linking to it. With no log.md yet (a receipt from mesa init before mesa
 * vault init), the receipt still stands and `warning` says the line is missing.
 */
export function writeReceipt(
  deps: ReceiptsDeps,
  input: ReceiptInput,
): { receipt: Receipt; path: string; warning?: string } {
  const { summary, details, ...fields } = input;
  const at = deps.clock();
  const started = fields.started ?? obsidianDateTime(at);
  const receipt = parseWith(ReceiptSchema, { ...fields, id: deps.newId(), started }, 'receipt');
  // The file name keeps the clock's seconds, which the minute-precision `started` drops.
  const path = receiptPath({ ...receipt, started: fields.started ?? at.toISOString() });
  const notes = { vault: deps.vault, clock: deps.clock };
  writeNote(notes, { path, frontmatter: receipt, body: receiptBody(summary, details) });
  try {
    // Brackets in the summary cannot open or close a link of their own before the receipt's.
    appendLog(notes, `${summary.replace(/\[\[|\]\]/g, '')} ${receiptLink(path)}`);
    return { receipt, path };
  } catch (error) {
    return { receipt, path, warning: `no log line: ${toFail(error).error.message}` };
  }
}

/** A receipt's body: its summary line, then its Details section. */
const receiptBody = (summary: string, details = 'None.') =>
  `${summary}\n\n## Details\n\n${details}\n`;

/**
 * Updates the session's receipt (the one `mesa open` or `mesa resume` wrote) in place, under the
 * vault lock: marked ended at `ended`, `outputs` merged into its own, and `details` in place of
 * its Details, each when given. Undefined when the session has no receipt.
 */
export async function updateSessionReceipt(
  deps: LockedNotesDeps,
  session: string,
  update: { ended?: Date; outputs?: Record<string, unknown>; details?: string },
): Promise<{ id: string; path: string } | undefined> {
  // ponytail: reads every receipt to find the session's; index them by session if vaults grow big.
  // The oldest: the receipt of the open or resume that started it, not the stop's own.
  const entry = listReceipts(deps.vault, Number.POSITIVE_INFINITY)
    .filter(
      (e) =>
        e.receipt.type === 'session' && e.receipt.session === session && e.receipt.status === 'ok',
    )
    .at(-1);
  if (!entry) return undefined;
  const { ended, outputs, details } = update;
  await updateNote(deps, entry.path, (note = { frontmatter: {}, body: '' }) => {
    const fields = ownFields(note.frontmatter);
    const before = (fields.outputs ?? {}) as Record<string, unknown>;
    const next = {
      ...fields,
      ...(ended ? { ended: obsidianDateTime(ended) } : {}),
      outputs: { ...before, ...outputs },
    };
    return {
      // Validated as writeReceipt validates, so an update cannot leave a receipt Mesa cannot read.
      frontmatter: parseWith(ReceiptSchema, next, entry.path),
      body: details === undefined ? note.body : receiptBody(summaryOf(note.body), details),
    };
  });
  return { id: entry.receipt.id, path: entry.path };
}

/** Every receipt file, newest first; files whose names are not a receipt's are left out. */
function receiptFiles(vault: string): string[] {
  const root = join(vault, VAULT.receipts);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((p) => ({ p, key: receiptSortKey(basename(p)) }))
    .filter((f): f is { p: string; key: string } => f.key !== undefined)
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((f) => join(VAULT.receipts, f.p));
}

/** A receipt body's first line: its summary. */
const summaryOf = (body: string) => body.split('\n', 1)[0] ?? '';

/** A receipt as read back: where it is, its frontmatter, and its body's first line. */
export type ReceiptEntry = { path: string; receipt: Receipt; summary: string; body: string };

function readReceipt(vault: string, path: string): ReceiptEntry {
  const note = readNote(vault, path);
  const receipt = parseWith(ReceiptSchema, ownFields(note.frontmatter), join(vault, path));
  return { path, receipt, summary: summaryOf(note.body), body: note.body };
}

/** The newest `limit` receipts with their frontmatter. */
export const listReceipts = (vault: string, limit = DEFAULT_RECEIPT_LIMIT): ReceiptEntry[] =>
  receiptFiles(vault)
    .slice(0, limit)
    .map((path) => readReceipt(vault, path));

export function showReceipt(vault: string, id: string): ReceiptEntry {
  const path = receiptFiles(vault).find((p) => p.endsWith(`-${id}.md`));
  if (!path) throw new MesaError('not_found', `no receipt with id ${id}; see mesa receipts`);
  return readReceipt(vault, path);
}
