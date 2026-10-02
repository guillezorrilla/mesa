import type { Receipt } from './schema.js';

/** Kept entries, including explicit refresh audits. Historical receipts may have no kind. */
export const RECORD_KINDS = [
  'decision',
  'guardrail',
  'vault-change',
  'connection',
  'refresh',
  'automation',
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/**
 * A guardrail entry is material when a person overrode it, or when a session started with launch
 * flags that turn off its agent's own permission checks or sandbox (`dangerousFlags`).
 */
export const keepSuccess = (kind: RecordKind | undefined, outputs: Record<string, unknown>) =>
  kind === 'decision' ||
  kind === 'vault-change' ||
  kind === 'connection' ||
  kind === 'refresh' ||
  kind === 'automation' ||
  (kind === 'guardrail' &&
    (typeof outputs.override === 'string' || typeof outputs.dangerousFlags === 'string'));

export const keepFailure = (kind: RecordKind | undefined, code: string) =>
  kind === 'automation' || (kind === 'guardrail' && code === 'guardrail_blocked');

/** The same meaningful history policy in Obsidian Bases' expression syntax. */
export const BASES_MEANINGFUL_FILTER = [
  '!(outputs && outputs.target.isType("string") && (outputs.target == "daily" || outputs.target.startsWith("daily/")))',
  '&& ((status == "ok" && (kind == "decision" || kind == "vault-change" || kind == "connection"',
  '|| (kind == "refresh" && outputs && ((outputs.refreshed.isType("list") && outputs.refreshed.length > 0)',
  '|| (outputs.notesWritten.isType("number") && outputs.notesWritten > 0)))',
  '|| (kind == "guardrail" && outputs',
  '&& (outputs.override.isType("string") || outputs.dangerousFlags.isType("string")))))',
  '|| ((status == "failed" || status == "blocked") && kind == "guardrail"',
  '&& outputs && outputs.error && outputs.error.code == "guardrail_blocked"))',
].join(' ');

/** Successful knowledge and material guardrails, excluding Daily bookkeeping. */
export function meaningfulReceipt(receipt: Receipt): boolean {
  const { kind, status, outputs } = receipt;
  const target = outputs.target;
  if (typeof target === 'string' && (target === 'daily' || target.startsWith('daily/')))
    return false;
  if (kind === 'refresh')
    return (
      status === 'ok' &&
      ((Array.isArray(outputs.refreshed) && outputs.refreshed.length > 0) ||
        (typeof outputs.notesWritten === 'number' && outputs.notesWritten > 0))
    );
  if (kind === 'automation') return false;
  const error = outputs.error;
  return status === 'ok'
    ? keepSuccess(kind, outputs)
    : keepFailure(
        kind,
        typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string'
          ? error.code
          : '',
      );
}
