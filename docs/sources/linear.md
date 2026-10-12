# Linear

Mesa connects to Linear as an OAuth app through its broker (ADR-0014). `mesa sources connect linear`, or Connect in Settings > Connections, opens Linear's sign-in in the default browser, where the person picks the workspace Mesa may read; the token goes in the macOS Keychain. Linear is also a tracker (CONTEXT.md, Tracker): a project's Tickets tab lists, shows, assigns and starts sessions from Linear issues. Mesa's one write to Linear is setting an issue's assignee to the signed-in person (Assign to me), with a receipt; every other call is a GraphQL query.

## Scopes

Mesa asks for `read,write`. Linear's scopes ([OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication), read 2026-10-11) are `read`, `write`, `issues:create` (creating issues and their attachments), `comments:create`, `timeSchedule:write`, and `admin`; Assign to me runs the `issueUpdate` mutation, which none of the narrower ones covers, so `write` is the narrowest that allows it. A connection made when Mesa asked for `read` alone keeps reading; assigning answers a GraphQL error whose message names the missing scope (`Invalid scope: \`write\` required`, Linear's wording as seen in the wild, not in its docs; a `FORBIDDEN` error whose message names a scope counts too), which Mesa turns into "Linear needs reconnecting to allow this", leaving the connection connected. Reconnecting once grants it. A Linear token is one workspace's, with the person's own access in it: the workspace picked on the consent screen. The authorize URL is `https://linear.app/oauth/authorize` with `client_id`, `scope=read,write`, `redirect_uri`, `state`, `response_type=code`, and `prompt=consent`, which shows the consent screen, and its workspace picker, again on a reconnect, so a reconnect can switch workspaces. A link to another workspace is refused with that workspace's URL key, before anything is fetched.

## Token lifetime and refresh

From [OAuth 2.0 authentication](https://linear.app/developers/oauth-2-0-authentication) (read 2026-10-11): the token request (`POST https://api.linear.app/oauth/token`) is a form (`application/x-www-form-urlencoded`) with `code`, `redirect_uri`, `client_id`, `client_secret`, and `grant_type`, and the answer has `access_token`, `token_type`, `expires_in` (86399, a day), `scope`, and `refresh_token`. A refresh (`grant_type=refresh_token`) answers a new access token and a new refresh token, so they rotate. Linear moved every app to refresh tokens on April 1, 2026. So the Keychain item holds both tokens, the expiry, the workspace, and the status; the authorized fetch refreshes a minute before the expiry, and a refused refresh marks the connection needs-reconnect.

Linear supports PKCE, with which the client secret is optional, so a public client could skip the broker. Mesa keeps the broker route, as for every other source (ADR-0014): one sign-in flow, and one registered callback per source, which the loopback listener's changing port needs.

An invalid token answers HTTP 401 with the GraphQL error code `AUTHENTICATION_ERROR` (checked 2026-10-11 with a made-up token), so the authorized fetch reads it as any 401: refresh once, then needs-reconnect.

## What the Tickets tab reads

What a project follows in Linear is a Ticket view (`mesa tickets views add --provider linear`): a team's current or next cycle (`--team <key or id>`, `--cycle current|next`), a project (`--linear-project <id, slug id or link>`), or a custom view (`--view <id or link>`, as ClickUp names its saved views), narrowed to the person's issues (`assignee: {isMe: {eq: true}}`) unless `--everyone`, and to issues not completed or canceled (`state: {type: {nin: [completed, canceled]}}`) unless `--show-done` (`sources/linear-teams.ts`, `sources/linear-tickets.ts`, `tickets/linear-provider.ts`).

- A cycle view finds its cycle again on every read: `team(id).activeCycle`, or its first cycle with `isNext`, so it moves to the next cycle on its own; a team with none says so (No active cycle, No next cycle). It then lists `issues(filter: {cycle: {id: {eq}}, ...})`.
- A project view lists `issues(filter: {project: {id: {eq}}, ...})`; a custom view lists `customView(id).issues(filter: ...)`, its own filter with Mesa's narrowing on top. A project or custom view link's last slug part is its slug id, which `project(id:)` and `customView(id:)` take (whether `customView(id:)` takes a slug id was not checked live).
- Every list is most recently updated first, 50 at a time by cursor, 100 at most (the count says "100+" past it). The Follow dialog shows the filter under Advanced. Issues group by their workflow state's type: triage, backlog and unstarted as To do, started as In progress, completed and canceled as Done.
- Panel: `issue(id: "<ID>")` with its state, assignee, priority, labels, cycle (name and dates), estimate, project, team, description and comments (50 at a time), with Open in Linear.
- Assign to me: `issueUpdate(id: "<ID>", input: {assigneeId: <viewer id>})`, which needs the `write` scope.
- The Follow dialog's teams (`mesa tickets teams`), and a team's current and next cycles, its projects not completed or canceled with their lead and progress, and the custom views of issues on that team or on none (`mesa tickets team <key>`).

A ticket's key is its identifier (`ENG-123`), its id `linear:ENG-123`. Start session imports the issue by its link (snapshots in `raw/linear/<ID>/`), and the session's record keeps `from: {source: linear, id: <ID>}`, which its Live dot matches. A Linear project or document in Context is no ticket: it starts no Ticket start.

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

OAuth apps get 5,000 requests and 2,000,000 complexity points an hour per user ([Rate limiting](https://linear.app/developers/rate-limiting)). Past it, Linear answers HTTP 400 with the GraphQL error code `RATELIMITED` and `X-RateLimit-Requests-Reset` (a UTC time in milliseconds); the authorized fetch counts that as a rate limit and waits until then (at most 60 s, three tries in all). A `RATELIMITED` error that comes without the 400 reaches the query instead, which says "Linear is rate limiting Mesa: try again in a minute". An import reads one query per item, and one more per 50 comments; a browse page one.

## Callback route

The app registers the broker's callback:

```
https://mesa-broker.guillecoto94.workers.dev/callback/linear
```

and, for a local broker under `wrangler dev`, `http://localhost:8787/callback/linear`. The broker relays the callback to Mesa's loopback listener, as for Atlassian.

## Setup (human, once)

1. A workspace admin creates the app in Linear: Settings > API > OAuth applications > New, named Mesa, with the callback URLs above.
2. Copy its client id and secret into the broker: `pnpm -C apps/broker exec wrangler secret put LINEAR_CLIENT_ID`, then `LINEAR_CLIENT_SECRET`, and deploy with `pnpm -C apps/broker deploy`. For a local broker, put them in `apps/broker/.dev.vars` (git-ignored) and run `pnpm -C apps/broker exec wrangler dev --port 8787`, with `MESA_BROKER_URL=http://localhost:8787` in Mesa's environment.

Not yet run live: the app is not registered, so sign-in, browse, import, refresh and the Tickets tab have run only against the fakes in `packages/core/src/sources/linear.test.ts` and `packages/core/src/tickets/linear.test.ts`.
