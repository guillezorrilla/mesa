# Linear

Mesa connects to Linear as an OAuth app through its broker (ADR-0014). `mesa sources connect linear`, or Connect in Settings > Connections, opens Linear's sign-in in the default browser, where the person picks the workspace Mesa may read; the token goes in the macOS Keychain. Mesa only reads: every call is a GraphQL query, and no mutation goes to Linear.

## Scopes

Mesa asks for `read` alone. A Linear token is one workspace's, with the person's own access in it: the workspace picked on the consent screen. The authorize URL is `https://linear.app/oauth/authorize` with `client_id`, `scope=read`, `redirect_uri`, `state`, `response_type=code`, and `prompt=consent`, which shows the consent screen, and its workspace picker, again on a reconnect, so a reconnect can switch workspaces. A link to another workspace is refused with that workspace's URL key, before anything is fetched.

## Token lifetime and refresh

From [OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication) (read 2026-10-11): the token request (`POST https://api.linear.app/oauth/token`) is a form (`application/x-www-form-urlencoded`) with `code`, `redirect_uri`, `client_id`, `client_secret`, and `grant_type`, and the answer has `access_token`, `token_type`, `expires_in` (86399, a day), `scope`, and `refresh_token`. A refresh (`grant_type=refresh_token`) answers a new access token and a new refresh token, so they rotate. Linear moved every app to refresh tokens on April 1, 2026. So the Keychain item holds both tokens, the expiry, the workspace, and the status; the authorized fetch refreshes a minute before the expiry, and a refused refresh marks the connection needs-reconnect.

Linear supports PKCE, with which the client secret is optional, so a public client could skip the broker. Mesa keeps the broker route, as for every other source (ADR-0014): one sign-in flow, and one registered callback per source, which the loopback listener's changing port needs.

An invalid token answers HTTP 401 with the GraphQL error code `AUTHENTICATION_ERROR` (checked 2026-10-11 with a made-up token), so the authorized fetch reads it as any 401: refresh once, then needs-reconnect.

## What an import reads

`mesa import <link>` (CONTEXT.md, Import) takes an issue, a project, or a document in the connected workspace:

- `https://linear.app/<workspace>/issue/<ID>`, with or without the title words after it: an issue. Snapshots go to `raw/linear/<ID>/` (`HAR-12`).
- `https://linear.app/<workspace>/project/<slug>`, with or without a tab after it (`/overview`, `/issues`): a project. Its slug is its title words, then its slug id; snapshots go to `raw/linear/project.<slug id>/`.
- `https://linear.app/<workspace>/document/<slug>`: a document. Snapshots go to `raw/linear/document.<slug id>/`.

Any other `linear.app` link (a team, a view, a cycle) is refused with the shapes above. The canonical URL drops the title words of an issue and any tab after a project, and a refresh resolves it again.

- Issue: `issue(id: "<ID>")`, with its status, team, project, cycle, assignee, priority, estimate, labels, due date, created and updated times, its description (Linear's Markdown), and its first 50 comments; more follow 50 at a time by cursor. The snapshot lists the facts, then the description, then every comment oldest first. Its revision is `updatedAt`; a changed-only refresh stops at the first query when it is unchanged. Whether a new comment alone changes `updatedAt` was not checked live; a plain refresh (no `--changed-only`) always reads every comment.
- Project: `project(id: "<slug id>")`, with its status, lead, teams, start and target dates, its summary (`description`), and its description (`content`, Linear's Markdown). Its revision is `updatedAt`.
- Document: `document(id: "<slug id>")`, its `content` as Linear's Markdown. Its revision is `updatedAt`.

Linear answers an item that is gone, or in a team the person cannot see, with an "Entity not found" GraphQL error, which Mesa reports as not found. That message was not checked live.

## What a browse reads

`mesa sources browse linear` (CONTEXT.md, Picker), node ids `<kind>:<id>...` (`sources/linear-tree.ts`): the root lists the connected workspace; a workspace its teams, then a Documents node; a team its All issues node, then its projects; All issues the team's issues; a project its issues; Documents the workspace's documents. Issues, projects, and documents import; a project also opens onto its issues.

- Workspace: `teams`.
- Team: `team(id).projects`, most recently updated first.
- All issues: `issues(filter: {team: {id: {eq}}})`, most recently updated first.
- Project: `issues(filter: {project: {id: {eq}}})`, most recently updated first.
- Documents: `documents`, most recently updated first.

Every list pages 25 at a time by Linear's cursor (`first`, `after`, `pageInfo.endCursor`). A search is Linear's own filter on titles (`title: {containsIgnoreCase}`), so each page holds only matches: issues across the workspace from the root or a workspace, in a team from a team or its All issues, in a project from a project; documents from Documents.

## Rate limits

OAuth apps get 5,000 requests and 2,000,000 complexity points an hour per user ([Rate limiting](https://linear.app/developers/rate-limiting)). Past it, Linear answers HTTP 400 with the GraphQL error code `RATELIMITED` and `X-RateLimit-Requests-Reset` (a UTC time in milliseconds); the authorized fetch counts that as a rate limit and waits until then (at most 60 s, three tries in all). An import reads one query per item, and one more per 50 comments; a browse page one.

## Callback route

The app registers the broker's callback:

```
https://mesa-broker.guillecoto94.workers.dev/callback/linear
```

and, for a local broker under `wrangler dev`, `http://localhost:8787/callback/linear`. The broker relays the callback to Mesa's loopback listener, as for Atlassian.

## Setup (human, once)

1. A workspace admin creates the app in Linear: Settings > API > OAuth applications > New, named Mesa, with the callback URLs above.
2. Copy its client id and secret into the broker: `pnpm -C apps/broker exec wrangler secret put LINEAR_CLIENT_ID`, then `LINEAR_CLIENT_SECRET`, and deploy with `pnpm -C apps/broker deploy`. For a local broker, put them in `apps/broker/.dev.vars` (git-ignored) and run `pnpm -C apps/broker exec wrangler dev --port 8787`, with `MESA_BROKER_URL=http://localhost:8787` in Mesa's environment.

Not yet run live: the app is not registered, so sign-in, browse, import, and refresh have run only against the fakes in `packages/core/src/sources/linear.test.ts`.
