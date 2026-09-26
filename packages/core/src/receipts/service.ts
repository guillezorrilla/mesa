import type { MesaContext } from '../context.js';
import { DEFAULT_RECEIPT_LIMIT, listReceipts, showReceipt } from './store.js';

/** The vault's receipts, newest first, and one by id. */
export const receiptsService = (ctx: MesaContext) => ({
  list: (limit = DEFAULT_RECEIPT_LIMIT) => listReceipts(ctx.vaultOf(), limit),
  show: (id: string) => showReceipt(ctx.vaultOf(), id),
});
