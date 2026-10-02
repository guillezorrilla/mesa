# Notion

Mesa connects to Notion as a public connection (Notion's word for an OAuth integration) through its broker (ADR-0014). `mesa sources connect notion`, or Connect in Settings > Connections, opens Notion's sign-in in the default browser, where the person picks the workspace and the pages Mesa may read; the token goes in the macOS Keychain. Every API call pins `Notion-Version: 2026-03-11` (`NOTION_VERSION` in `packages/core/src/sources/notion.ts`).

## Capabilities

Notion has no OAuth scopes: the connection's capabilities are set once in its settings, and the authorize URL asks for none (`owner=user`, `response_type=code`). Mesa's:

| Capability | For |
| --- | --- |
| Read content | pages, their Markdown, block children, databases, search |
| Read user information without email addresses | the bot's owner name shown in `mesa sources list`, people properties of database rows |

No insert, update, or comment capability: Mesa never writes to Notion. A person shares more pages later from a page's `...` > Connections menu in Notion; an item not shared answers 404, and the import says to share it.

## Token lifetime and refresh

Notion's token answer (`POST https://api.notion.com/v1/oauth/token`, HTTP Basic `client_id:client_secret`) has an `access_token` and a `refresh_token` and no `expires_in`; Notion documents no access-token lifetime. A refresh (`{grant_type: "refresh_token", refresh_token}`) returns a new access token and a new refresh token. So Mesa stores no expiry for a Notion connection, refreshes only when Notion answers 401, and keeps the rotated pair; a refused refresh marks it needs-reconnect. Sources: the [Authorization guide](https://developers.notion.com/docs/authorization) (Step 6) and [Refresh a token](https://developers.notion.com/reference/refresh-a-token). The token answer's `owner` (the person who signed in) is dropped; the connection keeps only the tokens and the workspace's id and name. `GET /v1/users/me` names the account live: the bot, by the name of the person who added it.

## What an import reads

`mesa import <link>` (CONTEXT.md, Import) takes a page or a database row, by any of these links; the id is the last 32 hex, dashed or not, and `?p=<id>` (a page opened over a database) wins over the path:

- `https://www.notion.so/<workspace>/<Title-words>-<32 hex>`
- `https://www.notion.so/<32 hex>` (or `notion.so`), and the dashed id
- `https://app.notion.com/p/<32 hex>`
- `...?pvs=<n>` and `...?v=<view>&p=<32 hex>&pvs=<n>`

The canonical link is `https://www.notion.so/<32 hex>`, and snapshots go to `raw/notion/<32 hex>/`. Two GETs per item:

- `GET /v1/pages/<id>`: the title, and for a row (a page whose parent is a data source) its properties, listed at the top as `- <name>: <value>` (rollups and buttons left out).
- `GET /v1/pages/<id>/markdown`: the content, as Notion's own enhanced Markdown. Mesa keeps it as Notion writes it, except that child pages, child databases, and mentions of pages and databases become Markdown links, a mentioned person their name, and empty blocks go (`sources/notion-markdown.ts`). A page past Notion's limit (about 20,000 blocks) is cut short by Notion, and the snapshot says so.

## What a browse reads

`mesa sources browse notion` (CONTEXT.md, Picker): the root lists the connected workspace; the workspace its top-level pages and databases; a page its child pages and databases; a database its rows. Pages and rows import; workspaces and databases only hold them.

- Workspace: `POST /v1/search`, 100 at a time, newest edit first, keeping what sits at the workspace's top (a page whose parent is the workspace, a data source whose database's is). A page of results may hold none of those, with a cursor to the next.
- Page: `GET /v1/blocks/<id>/children` (25 at a time), keeping `child_page` and `child_database` blocks; each database is read with `GET /v1/databases/<id>` for its data sources, one node each. A database not shared with Mesa is left out, and so is a page or database nested inside a toggle or a column.
- Database: `POST /v1/data_sources/<id>/query` (25 at a time).
- Search: `POST /v1/search` with `query`, which Notion matches against titles across the whole workspace, whatever the node.

Each follows Notion's `next_cursor` as `start_cursor`. Search and a data source query are the only POSTs Mesa sends to Notion; both are reads (the tests check every other request is a GET).

## Rate and plan limits

Notion allows each connection about 3 requests a second on average (180 a minute) on most plans, and 10 a second (600 a minute) on Business and Enterprise ([Request limits](https://developers.notion.com/reference/request-limits)). Past it, Notion answers 429 `rate_limited` with `Retry-After`, which the authorized fetch waits out (at most 60 s, three tries in all). An import reads two requests per item; a page of a browse one, plus one per child database.

Live run, 2026-10-02, throwaway profile `p8-live`, a personal workspace on Notion's free plan, the broker at `https://mesa-broker.guillecoto94.workers.dev`:

- One Allow on Notion's consent screen connected Mesa; the screen offers only the workspace the browser is signed in to, then a page picker. The token answer had no `expires_in` and a refresh token; the Keychain item held the tokens, the status, and the workspace (id, name), with no expiry and no owner. A later connect replaced the set of shared pages with the newly picked one.
- Browse listed the workspace's top-level shared pages, a page's child page and inline database, and the database's row (through its data source); search found the test page. No rate limit was met in about forty requests.
- `GET /pages/{id}/markdown` kept to-dos, code blocks, and child-page links. An inline database Notion had just made came back with no title, so it links as "Untitled database".
- Import by an `app.notion.com/p/<id>?pvs=` link and by a title-slug `www.notion.so/<Title>-<id>` link, with and without notes, wrote `raw/notion/<id>/` snapshots, notes linked from the hub, and receipts. Refresh after a source edit wrote a second snapshot, left the first unchanged, and the note had the new line with its `<!-- keep -->` block intact.
- Removing Mesa's access in Notion left the token valid: `GET /users/me` still answered 200 and search answered no results, so the connection stays `connected` (Mesa marks `needs-reconnect` only when a refresh is refused), browse shows an empty workspace, and an import says the page "is missing, or not shared with Mesa: share it with Mesa in Notion's Connections menu". Reconnecting, or sharing pages again, restores access.
- No access token expired during the run (about 40 minutes).

## Callback route

The only redirect URI registered with Notion is the broker's:

```
https://mesa-broker.guillecoto94.workers.dev/callback/notion
```

The broker relays it to Mesa's loopback listener, as for Atlassian.

## Setup (human, once)

1. In Notion's [developer portal](https://www.notion.so/profile/integrations), create a public connection named Mesa, with the capabilities above and the redirect URI above, and the broker's `/privacy` and `/terms` pages.
2. Copy its client id and secret into the broker: `pnpm -C apps/broker exec wrangler secret put NOTION_CLIENT_ID`, then `NOTION_CLIENT_SECRET`, and deploy with `pnpm -C apps/broker deploy`.
