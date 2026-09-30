import type { Receipt } from './schema.js';

/** Knowledge worth keeping in the vault. Historical receipts may have no kind. */
export const RECORD_KINDS = ['decision', 'guardrail', 'vault-change'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const keepSuccess = (kind: RecordKind | undefined, outputs: Record<string, unknown>) =>
  kind === 'decision' ||
  kind === 'vault-change' ||
  (kind === 'guardrail' && typeof outputs.override === 'string');

export const keepFailure = (kind: RecordKind | undefined, code: string) =>
  kind === 'guardrail' && code === 'guardrail_blocked';

/** The same meaningful history policy in Obsidian Bases' expression syntax. */
export const BASES_MEANINGFUL_FILTER = [
  '!(outputs && outputs.target.isType("string") && (outputs.target == "daily" || outputs.target.startsWith("daily/")))',
  '&& ((status == "ok" && (kind == "decision" || kind == "vault-change"',
  '|| (kind == "guardrail" && outputs && outputs.override.isType("string"))))',
  '|| ((status == "failed" || status == "blocked") && kind == "guardrail"',
  '&& outputs && outputs.error && outputs.error.code == "guardrail_blocked"))',
].join(' ');

/** Successful knowledge and material guardrails, excluding Daily bookkeeping. */
export function meaningfulReceipt(receipt: Receipt): boolean {
  const { kind, status, outputs } = receipt;
  const target = outputs.target;
  if (typeof target === 'string' && (target === 'daily' || target.startsWith('daily/')))
    return false;
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
