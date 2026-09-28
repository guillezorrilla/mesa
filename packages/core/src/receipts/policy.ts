/** Knowledge worth keeping in the vault. Historical receipts may have no kind. */
export const RECORD_KINDS = ['decision', 'guardrail', 'vault-change'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const keepSuccess = (kind: RecordKind | undefined, outputs: Record<string, unknown>) =>
  kind === 'decision' ||
  kind === 'vault-change' ||
  (kind === 'guardrail' && typeof outputs.override === 'string');

export const keepFailure = (kind: RecordKind | undefined, code: string) =>
  kind === 'guardrail' && code === 'guardrail_blocked';
