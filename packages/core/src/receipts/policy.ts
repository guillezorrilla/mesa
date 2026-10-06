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
 * A guardrail entry is material when a person overrode it, when a session started with launch
 * flags that turn off its agent's own permission checks or sandbox (`dangerousFlags`), or when
 * Mesa widened the profile's sandbox for a session's additional projects (`sandboxOverride`).
 */
export const keepSuccess = (kind: RecordKind | undefined, outputs: Record<string, unknown>) =>
  kind === 'decision' ||
  kind === 'vault-change' ||
  kind === 'connection' ||
  kind === 'refresh' ||
  kind === 'automation' ||
  (kind === 'guardrail' &&
    (typeof outputs.override === 'string' ||
      typeof outputs.dangerousFlags === 'string' ||
      typeof outputs.sandboxOverride === 'string'));

export const keepFailure = (kind: RecordKind | undefined, code: string) =>
  kind === 'automation' || (kind === 'guardrail' && code === 'guardrail_blocked');

/**
 * Successful knowledge and material guardrails, excluding Daily bookkeeping. `vault/bases.ts`
 * repeats it as the Meaningful view's filter.
 */
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
