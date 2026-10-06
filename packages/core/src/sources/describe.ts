import type { SourceRow } from './service.js';

/** A source's sites by name, `Lantern Cove, Tide Pool`; undefined when it lists none. */
export const siteNames = (source: Pick<SourceRow, 'sites'>) =>
  source.sites?.map((site) => site.name).join(', ');

/** What a source's row says under its name in the app: its connection, account, and sites. */
export function describeSource(source: SourceRow) {
  const names = siteNames(source);
  const sites = names ? `Sites: ${names}` : 'No sites';
  if (source.status === 'disconnected') return 'Not connected';
  if (source.status === 'needs-reconnect')
    return `Access was revoked or expired: reconnect to use it again. ${sites}`;
  return source.account ? `Signed in as ${source.account.name}. ${sites}` : sites;
}
