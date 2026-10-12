// The ticket providers' ids and a ticket's id across them (CONTEXT.md, Tracker). A leaf module, so
// sources/links.ts can read ticket ids without importing every provider's row (providers.ts).

/** Every ticket provider's id; PROVIDERS has one row per id. */
export const PROVIDER_IDS = ['jira', 'github', 'clickup', 'linear'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** A ticket's id across providers: the provider, a colon, its own key, such as jira:LC-12, github:owner/repo#12, clickup:DOCK-112 or linear:ENG-123. */
export const ticketId = (provider: ProviderId, key: string) => `${provider}:${key}`;

/** The provider a ticket id such as linear:ENG-123 names, and its key; undefined for anything else. */
export function qualifiedTicket(input: string): { provider: ProviderId; key: string } | undefined {
  const at = input.indexOf(':');
  const provider = PROVIDER_IDS.find(
    (p) => at > 0 && p === input.slice(0, at).trim().toLowerCase(),
  );
  return provider && { provider, key: input.slice(at + 1).trim() };
}

/** `input` as a provider and its key: a ticket id such as jira:LC-12, or a bare Jira key. */
export const ticketRef = (input: string): { provider: ProviderId; key: string } =>
  qualifiedTicket(input) ?? { provider: 'jira', key: input };
