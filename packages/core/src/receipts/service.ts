import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { RECEIPT_TYPES, type ReceiptType } from '../vault/receipt-file.js';
import { RECORD_KINDS, type RecordKind } from './policy.js';
import { listReceipts, showReceipt } from './store.js';

/** The vault's receipts, newest first, and one by id. */
export const receiptsService = (ctx: MesaContext) => ({
  /**
   * The newest `limit` (a positive whole number, else usage), or the store's default number; only
   * those of `type` (one of RECEIPT_TYPES, else usage) and of `session`, each when given.
   */
  list: (
    filter: {
      limit?: number;
      type?: string;
      session?: string;
      project?: string;
      kind?: string;
    } = {},
  ) => {
    const { limit, type, session, project, kind } = filter;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new MesaError('usage', `the limit must be a positive whole number, not ${limit}`);
    }
    if (type !== undefined && !RECEIPT_TYPES.includes(type as ReceiptType)) {
      const types = RECEIPT_TYPES.join(', ');
      throw new MesaError('usage', `a receipt's type is one of ${types}, not ${type}`);
    }
    if (kind !== undefined && !RECORD_KINDS.includes(kind as RecordKind)) {
      throw new MesaError(
        'usage',
        `a receipt's kind is one of ${RECORD_KINDS.join(', ')}, not ${kind}`,
      );
    }
    return listReceipts(ctx.vaultOf(), limit, {
      type: type as ReceiptType | undefined,
      session,
      project,
      kind: kind as RecordKind | undefined,
    });
  },
  show: (id: string) => showReceipt(ctx.vaultOf(), id),
});
