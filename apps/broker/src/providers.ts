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
};

/**
 * Every source the broker signs in to, one row each (ADR-0014). Notion is the next row; ClickUp
 * may come later. Each sends its client secret in the token request's JSON body.
 */
export const PROVIDERS: Record<string, Provider> = {
  atlassian: {
    authorizeUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes:
      'read:jira-work read:jira-user read:page:confluence read:space:confluence read:hierarchical-content:confluence search:confluence read:me offline_access',
    params: { audience: 'api.atlassian.com', response_type: 'code', prompt: 'consent' },
    env: { clientId: 'ATLASSIAN_CLIENT_ID', clientSecret: 'ATLASSIAN_CLIENT_SECRET' },
  },
};
