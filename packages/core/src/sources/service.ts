import type { MesaContext } from '../context.js';
import { authorizedFetch, notConnectedError, type SourceDeps } from './authorized-fetch.js';
import { brokerUrl } from './broker.js';
import { type BrowseQuery, browseNode } from './browse.js';
import { connectSource } from './connect.js';
import { type Account, connectionStore, type Site } from './connection.js';
import { SOURCE_IDS, SOURCES, type SourceId, sourceId } from './sources.js';

/**
 * One source as `mesa sources list` shows it: connected once it has a Connection, healthy or not.
 * The account is read live from the source, and left out when that read fails.
 */
export type SourceRow = {
  id: SourceId;
  label: string;
  connected: boolean;
  status: 'connected' | 'needs-reconnect' | 'disconnected';
  account?: Account;
  sites?: Site[];
};

/** The profile's Connections: connect, list, disconnect, and browse a Source, and call its API. */
export function sourcesService(ctx: MesaContext) {
  const deps: SourceDeps = {
    http: ctx.http,
    clock: ctx.clock,
    sleep: ctx.sleep,
    broker: brokerUrl(ctx.env),
    connections: connectionStore(ctx.secretStore, ctx.profile),
  };
  const row = async (id: SourceId): Promise<SourceRow> => {
    const label = SOURCES[id].label;
    const stored = await deps.connections.read(id);
    if (!stored) return { id, label, connected: false, status: 'disconnected' };
    const account =
      stored.status === 'connected'
        ? await SOURCES[id].account(authorizedFetch(deps, id)).catch(() => undefined)
        : undefined;
    // The read may have found the token revoked, and marked it so.
    const { status, sites } = account ? stored : ((await deps.connections.read(id)) ?? stored);
    return { id, label, connected: true, status, ...(account ? { account } : {}), sites };
  };
  return {
    list: async () => {
      ctx.open();
      return { sources: await Promise.all(SOURCE_IDS.map(row)) };
    },
    /** Signs in through the browser; the receipt names the source and its sites, nothing personal. */
    connect: (input: string) => {
      const source = sourceId(input);
      ctx.open();
      return ctx.record(
        {
          kind: 'connection',
          summary: (r) => `Connected ${r.label}`,
          failure: `Could not connect ${SOURCES[source].label}`,
          inputs: { source },
          outputs: (r) => ({ source, sites: r.sites?.map((site) => site.name) }),
        },
        async () => {
          await connectSource(
            { ...deps, listen: ctx.listen, run: ctx.run, newId: ctx.newId },
            source,
          );
          return row(source);
        },
      );
    },
    /** Deletes the source's Keychain item; a receipt only when there was one. */
    disconnect: (input: string) => {
      const source = sourceId(input);
      ctx.open();
      return ctx.record(
        {
          kind: 'connection',
          summary: () => `Disconnected ${SOURCES[source].label}`,
          failure: `Could not disconnect ${SOURCES[source].label}`,
          inputs: { source },
          outputs: () => ({ source }),
          changed: (result) => result.removed,
        },
        async () => ({ source, removed: await deps.connections.remove(source) }),
      );
    },
    /** `node`'s children in `source`'s tree, the root's when none (browseNode). Reads only. */
    browse: async (
      input: string,
      node?: string,
      query: BrowseQuery & { descendants?: boolean } = {},
    ) => {
      const source = sourceId(input);
      ctx.open();
      const sites = (await deps.connections.read(source))?.sites;
      if (!sites) throw notConnectedError(source);
      return browseNode(SOURCES[source].tree, authorizedFetch(deps, source), sites, node, query);
    },
    /** Fetch-shaped calls to `source`'s API with its token, refreshed as needed (authorizedFetch). */
    fetch: (source: SourceId) => authorizedFetch(deps, source),
    /** The sites `source`'s connection reaches; none when it has no connection. */
    sites: async (source: SourceId) => (await deps.connections.read(source))?.sites,
  };
}
