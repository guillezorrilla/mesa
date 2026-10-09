/** One vendor's OAuth app, as the broker uses it. Its client id and secret are Worker secrets. */
export type Provider = {
  authorizeUrl: string;
  tokenUrl: string;
  /** Space-separated, as the vendor's authorize URL takes them; the app registers the same. */
  scopes?: string;
  /** Extra authorize-URL parameters the vendor needs. */
  params: Record<string, string>;
  /** The Worker secrets holding the client id and secret (`wrangler secret put`). */
  env: { clientId: string; clientSecret: string };
  /**
   * How the token request carries the client id and secret: in its JSON body, or as HTTP Basic
   * (`basic`), as Notion asks.
   */
  clientAuth?: 'basic';
};

/**
 * Every source the broker signs in to, one row each (ADR-0014); ClickUp may come later. Notion's
 * public connection takes no scopes (its capabilities are set in the app) and its secret as HTTP
 * Basic.
 */
export const PROVIDERS: Record<string, Provider> = {
  atlassian: {
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes:
      'read:jira-work write:jira-work read:jira-user read:board-scope:jira-software read:sprint:jira-software read:project:jira read:page:confluence read:space:confluence read:hierarchical-content:confluence search:confluence read:me offline_access',
    params: { audience: 'api.atlassian.com', response_type: 'code', prompt: 'consent' },
    env: { clientId: 'ATLASSIAN_CLIENT_ID', clientSecret: 'ATLASSIAN_CLIENT_SECRET' },
  },
  notion: {
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    params: { owner: 'user', response_type: 'code' },
    env: { clientId: 'NOTION_CLIENT_ID', clientSecret: 'NOTION_CLIENT_SECRET' },
    clientAuth: 'basic',
  },
};
