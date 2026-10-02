import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { atlassianAccount, atlassianSites } from './atlassian.js';
import { atlassianTree } from './atlassian-tree.js';
import type { SourceTree } from './browse.js';
import type { Account, Site } from './connection.js';

/**
 * Every source Mesa connects to, one row each (CONTEXT.md, Source): its label, how its API names
 * the signed-in account and the sites it reaches, and its tree, which the Picker browses. The broker's providers table
 * (apps/broker) has a row of the same id.
 */
export const SOURCES = {
  atlassian: {
    label: 'Atlassian',
    account: atlassianAccount,
    sites: atlassianSites,
    tree: atlassianTree,
  },
} satisfies Record<
  string,
  {
    label: string;
    account: (get: Http) => Promise<Account>;
    sites: (get: Http) => Promise<Site[]>;
    tree: SourceTree;
  }
>;

export type SourceId = keyof typeof SOURCES;
export const SOURCE_IDS = Object.keys(SOURCES) as SourceId[];

/** A source id the person typed, checked against the table. */
export function sourceId(input: string): SourceId {
  if (Object.hasOwn(SOURCES, input)) return input as SourceId;
  throw new MesaError('usage', `unknown source ${input}; one of ${SOURCE_IDS.join(', ')}`);
}
