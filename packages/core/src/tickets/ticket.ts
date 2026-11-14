import type { MesaContext } from '../context.js';
import { itemIdOfKey } from '../sources/items.js';
import { liveSessions } from './live.js';
import type { Progress } from './provider.js';
import { type connectProviders, PROVIDERS, ticketId, ticketRef } from './providers.js';

/**
 * One ticket of the Tickets tab, by its id (jira:LC-12, github:owner/repo#12) or a bare Jira key: its whole panel,
 * read through its provider's row, assigning it to the person, and moving it to in progress.
 */
export function ticketActions(ctx: MesaContext, rows: ReturnType<typeof connectProviders>) {
  /** `input`'s provider row and its key, checked by that row. */
  const of = (input: string) => {
    const { provider, key } = ticketRef(input);
    const row = rows[provider];
    return { provider, row, key: row.key(key) };
  };
  return {
    /** The ticket with its description, comments and fields, whether it is the person's, and its sessions. */
    show: async (input: string, where?: string) => {
      const { provider, row, key } = of(input);
      const id = ticketId(provider, key);
      const detail = await row.show(key, where);
      const sessions = liveSessions(ctx).get(ticketId(provider, itemIdOfKey(key))) ?? [];
      return { ...detail, id, provider, sessions };
    },
    /** Assigns the ticket to the signed-in person, with a receipt. */
    assign: async (input: string, where?: string) => {
      const { provider, row, key } = of(input);
      const { name } = PROVIDERS[provider];
      const place = await row.place(where);
      return ctx.record(
        {
          kind: 'connection',
          summary: () => `Assigned ${key} to you in ${name}`,
          failure: `Could not assign ${key}`,
          inputs: { id: ticketId(provider, key), where: place },
          outputs: () => ({ id: ticketId(provider, key), where: place }),
        },
        async () => ({ key, assignee: (await row.assign(key, where)).assignee }),
      );
    },
    /**
     * Moves the ticket, while still to do, to its tracker's first in-progress status, with a
     * receipt; one already started or done, or a GitHub issue, stays where it is.
     */
    progress: async (input: string, where?: string) => {
      const { provider, row, key } = of(input);
      const { name } = PROVIDERS[provider];
      const place = await row.place(where);
      const id = ticketId(provider, key);
      return ctx.record(
        {
          kind: 'connection',
          summary: (r: Progress) => `Moved ${key} to ${r.status} in ${name}`,
          failure: `Could not move ${key} to in progress`,
          inputs: { id, where: place },
          outputs: (r: Progress) => ({ id, where: place, status: r.status }),
          // One that stayed where it was changed nothing: no receipt.
          changed: (r: Progress) => r.moved,
        },
        async () => ({ key, ...(await row.progress(key, where)) }),
      );
    },
  };
}
