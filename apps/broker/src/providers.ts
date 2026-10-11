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
  /** How the token request's body is encoded: JSON, or a form (`form`), as Linear asks. */
  tokenBody?: 'form';
};

/**
 * Every source the broker signs in to, one row each (ADR-0014). Notion's public connection takes
 * no scopes (its capabilities are set in the app) and its secret as HTTP Basic. ClickUp takes no
 * scopes either (a token reaches the Workspaces the person picks) and answers only an access token,
 * which does not expire. Linear asks for read only, takes its token request as a form, and answers
 * day-long access tokens with rotating refresh tokens; `prompt=consent` shows the workspace picker
 * again on a reconnect. GitHub's is a GitHub App: no scopes (its permissions, Issues read and
 * write, are set on the app), 8-hour user tokens with rotating refresh tokens, a form token
 * request, and refusals answered as HTTP 200 with an `error`.
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
  clickup: {
    authorizeUrl: 'https://app.clickup.com/api',
    tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
    params: {},
    env: { clientId: 'CLICKUP_CLIENT_ID', clientSecret: 'CLICKUP_CLIENT_SECRET' },
  },
  linear: {
    authorizeUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scopes: 'read',
    params: { response_type: 'code', prompt: 'consent' },
    env: { clientId: 'LINEAR_CLIENT_ID', clientSecret: 'LINEAR_CLIENT_SECRET' },
    tokenBody: 'form',
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    params: {},
    env: { clientId: 'GITHUB_CLIENT_ID', clientSecret: 'GITHUB_CLIENT_SECRET' },
    tokenBody: 'form',
  },
};
