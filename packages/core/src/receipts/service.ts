import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { listReceipts, showReceipt } from './store.js';

/** The vault's receipts, newest first, and one by id. */
export const receiptsService = (ctx: MesaContext) => ({
  /** The newest `limit` (a positive whole number, else usage), or the store's default number. */
  list: (limit?: number) => {
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new MesaError('usage', `the limit must be a positive whole number, not ${limit}`);
    }
    return listReceipts(ctx.vaultOf(), limit);
  },
  show: (id: string) => showReceipt(ctx.vaultOf(), id),
});
