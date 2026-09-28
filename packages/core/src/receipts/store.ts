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
import { type ReceiptType, receiptLink, receiptName, receiptPath } from './receipt-file.js';
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
 * The receipt a session's start wrote: `mesa open`'s or `mesa resume`'s `session` receipt, or a
 * skill run's `skill` one. Undefined when the session has none.
 */
export function sessionReceipt(vault: string, session: string): ReceiptEntry | undefined {
  // ponytail: reads every receipt to find the session's; index them by session if vaults grow big.
  // The oldest: the receipt of the start, not a stop's or a send's own (a failed start names no
  // session).
  return listReceipts(vault, Number.POSITIVE_INFINITY, { session })
    .filter((e) => e.receipt.type === 'session' || e.receipt.type === 'skill')
    .at(-1);
}

/**
 * Updates the receipt a session's start wrote (sessionReceipt) in place, under the vault lock:
 * marked ended at `ended`, its `status` and `cost` set, `outputs` merged into its own, and
 * `details` in place of its Details, each when given. Undefined when the session has no receipt.
 */
export async function updateSessionReceipt(
  deps: LockedNotesDeps,
  session: string,
  update: {
    ended?: Date;
    status?: Receipt['status'];
    cost?: number;
    outputs?: Record<string, unknown>;
    details?: string;
  },
): Promise<{ id: string; path: string } | undefined> {
  const entry = sessionReceipt(deps.vault, session);
  if (!entry) return undefined;
  const { ended, status, cost, outputs, details } = update;
  await updateNote(deps, entry.path, (note = { frontmatter: {}, body: '' }) => {
    const fields = ownFields(note.frontmatter);
    const before = (fields.outputs ?? {}) as Record<string, unknown>;
    const next = {
      ...fields,
      ...(ended ? { ended: obsidianDateTime(ended) } : {}),
      ...(status ? { status } : {}),
      ...(cost === undefined ? {} : { cost }),
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

/**
 * Every receipt file, newest first, with the type its name carries; files whose names are not a
 * receipt's are left out.
 */
function receiptFiles(vault: string): { path: string; type: ReceiptType }[] {
  const root = join(vault, VAULT.receipts);
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((p) => ({ p, name: receiptName(basename(p)) }))
    .filter((f): f is { p: string; name: NonNullable<typeof f.name> } => f.name !== undefined)
    .sort((a, b) => b.name.key.localeCompare(a.name.key))
    .map((f) => ({ path: join(VAULT.receipts, f.p), type: f.name.type }));
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

/** Which receipts to list: those of one `type`, of one `session`, each when given. */
export type ReceiptFilter = {
  type?: ReceiptType;
  session?: string;
  project?: string;
  kind?: Receipt['kind'];
};

/**
 * The newest `limit` receipts that pass the filter, with their frontmatter. The type is read from
 * each file's name, so only the receipts of that type are opened.
 */
export function listReceipts(
  vault: string,
  limit = DEFAULT_RECEIPT_LIMIT,
  { type, session, project, kind }: ReceiptFilter = {},
): ReceiptEntry[] {
  const found: ReceiptEntry[] = [];
  for (const file of receiptFiles(vault)) {
    if (found.length >= limit) break;
    if (type !== undefined && file.type !== type) continue;
    const entry = readReceipt(vault, file.path);
    if (session !== undefined && entry.receipt.session !== session) continue;
    if (project !== undefined && entry.receipt.project !== project) continue;
    if (kind !== undefined && entry.receipt.kind !== kind) continue;
    found.push(entry);
  }
  return found;
}

export function showReceipt(vault: string, id: string): ReceiptEntry {
  const file = receiptFiles(vault).find((f) => f.path.endsWith(`-${id}.md`));
  if (!file) throw new MesaError('not_found', `no receipt with id ${id}; see mesa receipts`);
  return readReceipt(vault, file.path);
}
