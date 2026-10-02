# Atlassian

Mesa connects to Atlassian (Jira and Confluence Cloud) with OAuth 2.0 (3LO) through its broker (ADR-0014). `mesa sources connect atlassian`, or Connect in Settings > Connections, opens the sign-in in the default browser; the token goes in the macOS Keychain.

## Scopes

Classic and granular scopes, space-separated, exactly as the broker asks for them (`apps/broker/src/providers.ts`) and as the app registers them:

| Scope | For |
| --- | --- |
| `read:jira-work` | Jira projects, issues, comments |
| `read:jira-user` | Jira users named on issues |
| `read:page:confluence` | Confluence pages |
| `read:space:confluence` | Confluence spaces |
| `read:hierarchical-content:confluence` | a page's children, for the tree |
| `search:confluence` | resolving a pasted Confluence link, CQL search |
| `read:me` | the signed-in account, shown in `mesa sources list` |
| `offline_access` | a refresh token, so a connection outlives the one-hour access token |

All are read scopes: Mesa never writes to Atlassian.

## Callback route

The only callback URL registered with Atlassian is the broker's:

```
https://mesa-broker.guillecoto94.workers.dev/callback/atlassian
```

The broker relays it to Mesa's loopback listener (`http://127.0.0.1:<port>/callback`, the port named in `state`). A self-hosted broker registers its own `https://<worker>/callback/atlassian`.

The app listing's privacy policy and terms are the broker's pages:

- `https://mesa-broker.guillecoto94.workers.dev/privacy`
- `https://mesa-broker.guillecoto94.workers.dev/terms`

## Setup (human, once)

1. In the [Atlassian developer console](https://developer.atlassian.com/console/myapps/), create an OAuth 2.0 integration.
2. Permissions: add the Jira API and the Confluence API with the scopes above, plus User identity API for `read:me`.
3. Authorization: set the callback URL to `https://mesa-broker.guillecoto94.workers.dev/callback/atlassian`.
4. Distribution: turn sharing on, so accounts other than the owner's can consent. Declare that the app stores no personal data (Mesa keeps only tokens and site names), and give the privacy policy URL above.
5. Settings: copy the client id and secret into the broker: `pnpm -C apps/broker exec wrangler secret put ATLASSIAN_CLIENT_ID`, then `ATLASSIAN_CLIENT_SECRET`, and deploy with `pnpm -C apps/broker deploy`.

## Company sites that block third-party apps

TODO (lead, after the live run): what a sign-in shows on a company site whose org admin blocks third-party apps until approved, what `mesa sources list` reports, and how an admin approves Mesa.
