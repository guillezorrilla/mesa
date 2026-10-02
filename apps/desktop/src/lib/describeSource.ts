import type { SourceRow } from '@mesa/core';

/** What a source's row says under its name: its connection, account, and sites. */
export function describeSource(source: SourceRow) {
  const sites = source.sites?.length
    ? `Sites: ${source.sites.map((site) => site.name).join(', ')}`
    : 'No sites';
  if (source.status === 'disconnected') return 'Not connected';
  if (source.status === 'needs-reconnect')
    return `Access was revoked or expired: reconnect to use it again. ${sites}`;
  return source.account ? `Signed in as ${source.account.name}. ${sites}` : sites;
}
