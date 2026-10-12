import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import { isClickupTask } from '../sources/clickup.js';
import type { ItemRef } from '../sources/items.js';
import type { SourceId } from '../sources/sources.js';
import { clickupProvider } from './clickup-provider.js';
import { type ClickupViewInput, ClickupViewSchema, describeClickupView } from './clickup-view.js';
import { githubProvider } from './github-provider.js';
import { describeGithubView, type GithubViewInput, GithubViewSchema } from './github-view.js';
import { jiraProvider } from './jira-provider.js';
import { describeJiraView, type JiraViewInput, JiraViewSchema } from './jira-view.js';
import type { ProviderDeps } from './provider.js';

/** Every item its source imports is one of its tickets (Jira's issues, GitHub's issues). */
const everyItem = () => true;

/**
 * The ticket providers (CONTEXT.md, Ticket view), keyed by id: each row's name, the source whose
 * connection it reads, which of that source's imported items are its tickets, a line describing
 * one of its views, and its reads and its one write (TicketProvider). A new tracker is one row
 * here, its view in TicketViewSchema, and its files.
 */
export const PROVIDERS = {
  jira: {
    name: 'Jira',
    source: 'atlassian',
    ticket: everyItem,
    describe: describeJiraView,
    connect: jiraProvider,
  },
  github: {
    name: 'GitHub Issues',
    source: 'github',
    ticket: everyItem,
    describe: describeGithubView,
    connect: githubProvider,
  },
  clickup: {
    name: 'ClickUp',
    source: 'clickup',
    /** Its tasks; a Doc page is not a ticket. */
    ticket: (item: Pick<ItemRef, 'url'>) => isClickupTask(item.url),
    describe: describeClickupView,
    connect: clickupProvider,
  },
} as const satisfies Record<
  string,
  {
    name: string;
    source: SourceId;
    /** Whether an item imported from it (its `source` this provider's id) is one of its tickets. */
    ticket: (item: Pick<ItemRef, 'id' | 'url'>) => boolean;
    describe: (view: never) => string;
    connect: (deps: ProviderDeps) => unknown;
  }
>;
export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/**
 * Whether imported `item` is a ticket: its source is a ticket provider's, and that provider's row
 * says the item is one of its tickets (a ClickUp task, not a Doc page).
 */
export function isTicketItem(item: Pick<ItemRef, 'id' | 'url'> & { source: string }): boolean {
  const provider = PROVIDER_IDS.find((p) => p === item.source);
  return provider !== undefined && PROVIDERS[provider].ticket(item);
}

/** Provider `id`'s name, such as Jira. */
export const providerName = (id: ProviderId): string => PROVIDERS[id].name;

/** A view of any provider as tickets.yaml keeps it; one written before providers reads as Jira's. */
export const TicketViewSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !('provider' in v) ? { ...v, provider: 'jira' } : v),
  z.discriminatedUnion('provider', [JiraViewSchema, GithubViewSchema, ClickupViewSchema]),
);
export type TicketView = z.infer<typeof TicketViewSchema>;

/** `view` in a line, in its provider's words. */
export const describeView = (view: TicketView): string =>
  (PROVIDERS[view.provider].describe as (view: TicketView) => string)(view);

/** Every provider's row over the profile's Connections. */
export const connectProviders = (deps: ProviderDeps) =>
  Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].connect(deps)])) as {
    [K in ProviderId]: ReturnType<(typeof PROVIDERS)[K]['connect']>;
  };

/** `id` as a provider, or a usage error listing them. */
export function providerOf(id: string): ProviderId {
  const found = PROVIDER_IDS.find((p) => p === id.trim().toLowerCase());
  if (!found)
    throw new MesaError('usage', `no ticket provider ${id}; one of ${PROVIDER_IDS.join(', ')}`);
  return found;
}

/** A ticket's id across providers: the provider, a colon, its own key, such as jira:LC-12, github:owner/repo#12 or clickup:DOCK-112. */
export const ticketId = (provider: ProviderId, key: string) => `${provider}:${key}`;

/** `input` as a provider and its key: a ticket id such as jira:LC-12, or a bare Jira key. */
export function ticketRef(input: string): { provider: ProviderId; key: string } {
  const at = input.indexOf(':');
  const provider = PROVIDER_IDS.find((p) => p === input.slice(0, at).trim().toLowerCase());
  return provider ? { provider, key: input.slice(at + 1) } : { provider: 'jira', key: input };
}

/**
 * What `mesa tickets views add` takes: a view of any provider, before its provider checks it;
 * one naming no provider is Jira's.
 */
export type ViewInput = JiraViewInput | GithubViewInput | ClickupViewInput;

/** A view's query without its name, as the Follow dialog's live count takes it (per provider). */
export type ViewQuery = ViewInput extends infer V
  ? V extends unknown
    ? Omit<V, 'name'>
    : never
  : never;
