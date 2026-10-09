# Atlassian

Mesa connects to Atlassian (Jira and Confluence Cloud) with OAuth 2.0 (3LO) through its broker (ADR-0014). `mesa sources connect atlassian`, or Connect in Settings > Connections, opens the sign-in in the default browser; the token goes in the macOS Keychain.

## Scopes

Classic and granular scopes, space-separated, exactly as the broker asks for them (`apps/broker/src/providers.ts`) and as the app registers them:

| Scope | For |
| --- | --- |
| `read:jira-work` | Jira projects, issues, comments |
| `read:jira-user` | Jira users named on issues |
| `read:board-scope:jira-software` | Jira boards, for a ticket view (#693) |
| `read:sprint:jira-software` | a board's active and future sprints, for a ticket view |
| `read:project:jira` | the project a board belongs to, which the boards API asks for |
| `read:page:confluence` | Confluence pages |
| `read:space:confluence` | Confluence spaces |
| `read:hierarchical-content:confluence` | a page's ancestors (not granted live, see below) |
| `search:confluence` | resolving a pasted Confluence link, CQL search |
| `read:me` | the signed-in account, shown in `mesa sources list` |
| `offline_access` | a refresh token, so a connection outlives the one-hour access token |

All are read scopes: Mesa never writes to Atlassian.

`read:hierarchical-content:confluence` is requested and configured in the app, but in the live sign-in (2026-10-01) Atlassian did not grant it on the token: `GET /wiki/api/v2/pages/{id}/ancestors` answered 401 "scope does not match", while `GET /wiki/api/v2/pages/{id}/direct-children` worked. A page's tree is built from its children, not its ancestors.

## What an import reads

`mesa import` (CONTEXT.md, Import) makes only GETs, each through the authorized fetch:

- Jira: `/ex/jira/<cloud id>/rest/api/3/issue/<key>?expand=renderedFields`, then `/issue/<key>/comment?expand=renderedBody&startAt=<n>&maxResults=100` until every comment is read.
- Confluence: `/ex/confluence/<cloud id>/wiki/api/v2/pages/<id>?body-format=view`, then each ancestor by the page's `parentId` (`/pages/<parentId>`, while `parentType` is `page`, at most ten). The `/pages/<id>/ancestors` endpoint answers 401 "scope does not match" on real tokens, which lack `read:hierarchical-content:confluence`.

A 404 or 403 means the item is gone or not shared with the signed-in account; the import says so and writes nothing.

## What a browse reads

`mesa sources browse atlassian` (CONTEXT.md, Picker) makes only GETs through the same authorized fetch, 25 children to a page:

- Confluence: `/wiki/api/v2/spaces`, a space's top pages with `/spaces/<id>/pages?depth=root`, and a page's children with `/pages/<id>/direct-children` (pages only: folders and whiteboards are left out). Each follows `_links.next`'s `cursor`. The v2 lists say nothing of a page's own children, so every page reports `hasChildren: true` and one without opens on nothing. Descendants are walked by `direct-children`, never `/descendants` or `/ancestors`.
- Confluence search: CQL on `/wiki/rest/api/search`, `type = page and title ~ "<q>"`, narrowed by `space = "<key>"` in a space or `ancestor = <id>` under a page.
- Jira: `/rest/api/3/project/search` (`startAt`, until `isLast`), and a project's issues by `/rest/api/3/search/jql` with `project = "<KEY>" ORDER BY updated DESC` (`nextPageToken`); a search is `text ~ "<q>"`.

A 429, or a 503 with `Retry-After`, waits as `Retry-After` asks (at most 60 s; 1 s then 2 s without one) and tries again, three tries in all, for imports and browses alike.

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

Tried on 2026-10-02 against a company Atlassian site whose admin does not block third-party apps: a member's consent connected Mesa with no admin step. Mesa was registered under a personal developer account, and that made no difference: with sharing on, any Atlassian account can consent for the sites it can use.

Where an org admin blocks unapproved third-party apps (Atlassian Administration > Security > User security > App access rules, or user-installed app settings), Atlassian refuses the consent itself or asks the user to request approval, so no code reaches the broker and `mesa sources connect` ends with the callback's error and stores nothing. The admin approves "Mesa" in Atlassian Administration, after which the same one-click Connect works. This blocked case was not tried live (no such site was available).

## What the Tickets tab reads

`mesa tickets` (CONTEXT.md, Ticket view) makes only GETs through the same authorized fetch:

- Boards: `/rest/agile/1.0/board?name=<q>`, and one board by `/board/<id>` when a view is added. A board view's sprints: `/board/<id>/sprint?state=active`, or `state=future` for the next sprint, read again every time the list is.
- Saved filters: `/rest/api/3/filter/search?filterName=<q>`, and one by `/filter/<id>` when a view is added.
- Tickets: `/rest/api/3/search/jql` with `fields=summary,status,assignee`, the first 100 per view.

Jira Software's API takes granular scopes only. A connection made before Mesa asked for them is answered 401 "scope does not match". The board view then says to reconnect, and the connection stays connected for everything else.

