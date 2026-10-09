import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { atlassianAccount } from '../sources/atlassian.js';
import { notConnectedError } from '../sources/authorized-fetch.js';
import type { Account, Site } from '../sources/connection.js';
import type { SourceId } from '../sources/sources.js';

/** What the Tickets tab reads Jira through: the profile's Connections (sources/service.ts). */
export type JiraDeps = {
  fetch: (source: SourceId) => Http;
  sites: (source: SourceId) => Promise<Site[] | undefined>;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The Atlassian connection as the Tickets tab uses it: its authorized fetch, the site a call
 * names (or the one site it reaches), and the signed-in account, read once per service.
 */
export function jiraAccess(deps: JiraDeps) {
  const get = () => deps.fetch('atlassian');
  const connected = async () => {
    const sites = await deps.sites('atlassian');
    if (!sites?.length) throw notConnectedError('atlassian');
    return sites;
  };
  let me: Promise<Account> | undefined;
  return {
    get,
    connected,
    /** The site `name` (its name or cloud id), or the one site the connection reaches. */
    siteOf: async (name?: string): Promise<Site> => {
      const sites = await connected();
      if (name) {
        const found = sites.find((s) => s.id === name || same(s.name, name));
        if (!found) throw new MesaError('not_found', `Atlassian reaches no site ${name}`);
        return found;
      }
      if (sites.length === 1 && sites[0]) return sites[0];
      throw new MesaError(
        'usage',
        `pass --site: Atlassian reaches ${sites.map((s) => s.name).join(', ')}`,
      );
    },
    /** The signed-in account, whose id says which tickets are the person's. */
    me: () => {
      me ??= atlassianAccount(get());
      return me;
    },
  };
}
export type JiraAccess = ReturnType<typeof jiraAccess>;
