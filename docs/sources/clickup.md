# ClickUp

Mesa connects to ClickUp as an OAuth app through its broker (ADR-0014). `mesa sources connect clickup`, or Connect in Settings > Connections, opens ClickUp's sign-in in the default browser, where the person picks the Workspaces Mesa may read; the token goes in the macOS Keychain. Mesa reads, and writes one thing: Assign to me in the Tickets tab adds the person to a task's assignees (see Tickets). ClickUp's OAuth has no scopes, so assigning takes the same token.

## Scopes

ClickUp's OAuth has no scopes: a token reaches every Workspace the person picked on the consent screen, with that person's own access. The authorize URL is `https://app.clickup.com/api` with `client_id`, `redirect_uri`, and `state`, and nothing else. A Workspace the person did not pick answers 401 `Team not authorized`; Mesa reads that as "not in a Workspace Mesa was given" (not found) and leaves the connection connected. Picking more Workspaces later is a reconnect.

## Token lifetime and refresh

ClickUp's token answer (`POST https://api.clickup.com/api/v2/oauth/token`, `client_id`, `client_secret`, and `code` in the JSON body) is `{access_token}` alone: no `refresh_token` and no `expires_in`. ClickUp says "The access token currently does not expire. This is subject to change" ([Authentication](https://developer.clickup.com/docs/authentication)). So the Keychain item holds the access token, the Workspaces, and the status, with no refresh token and no expiry; a 401 that is not `Team not authorized` means the token was revoked, and marks the connection needs-reconnect with no refresh attempt.

## What an import reads

`mesa import <link>` (CONTEXT.md, Import) takes a task or a Doc page:

- `https://app.clickup.com/t/<task id>`: a task. Snapshots go to `raw/clickup/<task id>/`.
- `https://app.clickup.com/t/<workspace id>/<custom id>`: a task by its custom id (Workspaces with custom task ids on), read with `custom_task_ids=true&team_id=<workspace id>`. Snapshots go to `raw/clickup/<custom id>/`.
- `https://app.clickup.com/<workspace id>/v/dc/<doc id>/<page id>`: a Doc page. Snapshots go to `raw/clickup/<doc id>.<page id>/`.

A custom id holds a dash (its prefix's); `/t/<workspace>/<id>` with a plain id is read as `/t/<id>`. Any other `app.clickup.com` link (a list view, a Doc with no page) is refused with the shapes above. The link is canonical as written, and a refresh resolves it again. The Picker's tasks link by plain id, so a task imported once by its custom-id link and once from the Picker has two folders.

- Task: `GET /api/v2/task/<id>?include_markdown_description=true`, then its comments, `GET /api/v2/task/<id>/comment`, which answers the newest 25; older ones follow with `start` and `start_id` from the last comment, until a page holds fewer than 25. The snapshot lists status, list, assignees, tags, created, and updated, then the description (ClickUp's `markdown_description`), then every comment oldest first. Its revision is `date_updated`; a changed-only refresh reads the task alone and skips the comments when it is unchanged. Whether a new comment alone changes `date_updated` was not checked live; a plain refresh (no `--changed-only`) always reads every comment. Replies in a comment's thread are not read, only the comments themselves.
- Doc page: `GET /api/v3/workspaces/<workspace>/docs/<doc>/pages/<page>?content_format=text/md`, its content as ClickUp's Markdown. Its revision is `date_updated`.

## What a browse reads

`mesa sources browse clickup` (CONTEXT.md, Picker), node ids `<kind>:<workspace>:<id>...` (`sources/clickup-tree.ts`): the root lists the connected Workspaces; a Workspace its spaces and a Docs node; a space its folders, then its lists outside any folder; a folder its lists; a list its tasks; Docs the Workspace's Docs; a Doc or a page its pages. Tasks and Doc pages import; the rest only hold them.

- Workspace: `GET /api/v2/team/<workspace>/space?archived=false`.
- Space: `GET /api/v2/space/<id>/folder?archived=false` and `GET /api/v2/space/<id>/list?archived=false`.
- Folder: `GET /api/v2/folder/<id>/list?archived=false`.
- List: `GET /api/v2/list/<id>/task?page=<n>&include_closed=true`, 100 a page (subtasks left out, as ClickUp does by default); the cursor is the next page number, until `last_page`.
- Docs: `GET /api/v3/workspaces/<workspace>/docs?limit=25`, following ClickUp's `next_cursor` as `cursor`.
- Doc, or page: `GET /api/v3/workspaces/<workspace>/docs/<doc>/page_listing`, the page tree in one answer.

Spaces, folders, lists, and a Doc's pages come whole: ClickUp does not page them.

ClickUp's API has no text search, so a search keeps the names under the node that hold the text, ignoring case: tasks across a Workspace, a space, a folder, or a list through filtered team tasks (`GET /api/v2/team/<workspace>/task?page=<n>&include_closed=true` with `space_ids[]`, `project_ids[]` (a folder), or `list_ids[]`), matching the name or custom id; Docs by name under Docs; pages by name in a Doc. From the root or a Workspace a search finds tasks; Docs are searched under the Docs node. From the root it searches each Workspace in turn. A page of results may hold no match, with a cursor to the next.

## Tickets

A project can track its work in ClickUp (CONTEXT.md, Tracker, Ticket view). A ClickUp view follows one of a List, a Folder or a Space (every List in it), or a saved ClickUp view, by its link or id (`mesa tickets views add --provider clickup --list|--folder|--space|--view <link or id> [--workspace <id>] [--everyone] [--show-done]`). A link names its Workspace: `/<ws>/v/li/<list>`, `/<ws>/v/f/<folder>`, `/<ws>/v/s/<space>`, a view of one of them such as `/<ws>/v/b/li/<list>`, or a saved view, `/<ws>/v/<type>/<view id>`; a bare id is in the one connected Workspace, or `--workspace`. Adding a view reads its name and place: `GET /api/v2/list/<id>`, `/folder/<id>`, `/space/<id>` or `/view/<id>`.

- List: `GET /api/v2/list/<id>/task?subtasks=true[&include_closed=true][&assignees[]=<me>]&page=<n>`.
- Folder or Space: the Workspace's filtered tasks, `GET /api/v2/team/<ws>/task?project_ids[]=<folder>` (or `space_ids[]=<space>`) with the same query.
- Saved view: `GET /api/v2/view/<id>/task?page=<n>`, which takes no narrowing of its own: its own filters apply, and Mesa keeps the person's tasks and leaves out closed ones unless the view says otherwise.

Each read takes up to three pages of 100 tasks, `more` when ClickUp has more after them. Hide closed tasks leaves out the statuses of type `closed`; the list groups by status type (open to do, custom in progress, done and closed done). A task's key is its `custom_id` when its Workspace has them, else its id, and its link (`/t/<ws>/<custom id>` or `/t/<id>`) is what Start session imports, so the Live dot matches the session the import starts.

The panel reads `GET /api/v2/task/<key>?include_markdown_description=true` (with `custom_task_ids=true&team_id=<ws>` for a custom id, trying each connected Workspace when several), its comments as an import does, its Space's name (`GET /api/v2/space/<id>`), and its parent task on a subtask. Assign to me is `PUT /api/v2/task/<key>` with `{"assignees": {"add": [<me>], "rem": []}}`, with a receipt; a task whose answer does not list the person says so.

The Follow dialog's Location tree reads each Workspace's Spaces, then per Space its Folders with their Lists and its Lists outside any Folder (`GET /api/v2/team/<ws>/space`, `/space/<id>/folder`, `/space/<id>/list`, `archived=false`), searched in the app (`mesa tickets locations`). Its Saved view tab lists the task views at the Workspace's Everything level and in each Space (`GET /api/v2/team/<ws>/view`, `/space/<id>/view`; `mesa tickets saved-views`); a view kept in a Folder or a List is followed by its link.

## Rate and plan limits

ClickUp limits each token per minute by the Workspace's plan: 100 requests on Free Forever, Unlimited, and Business, 1,000 on Business Plus, 10,000 on Enterprise ([Rate limits](https://developer.clickup.com/docs/rate-limits)). Past it, ClickUp answers 429 with `X-RateLimit-Reset` (a Unix time in seconds) and no `Retry-After`, so the authorized fetch waits until that time (at most 60 s, three tries in all). An import reads one request per Doc page, and two or more per task (the task, and its comments 25 at a time); a browse page one, a space two. On the 100-a-minute plans, a search over a large Workspace reads one request per 100 tasks.

Live run, 2026-10-11, throwaway profile `clickup-live`, a test Workspace on ClickUp's Free Forever plan (100 requests a minute), the broker under `wrangler dev` at `http://localhost:8787` (the app's redirect URL `localhost:8787`):

- One Connect on ClickUp's consent screen connected Mesa with the one Workspace picked. The token answer had only `access_token`: the Keychain item held the access token, the status, and the Workspace (id, name), with no refresh token, no expiry, and no account data. `/api/v2/user` named the account live.
- Browse listed the Workspace's space and its Docs node, the space's two folderless lists, each list's tasks (three each, one page), the Docs (one), and the Doc's two pages. Search found tasks from the root, the Workspace, the space, and a list (`list_ids[]` and `space_ids[]` both took effect), and a search for text no name holds found nothing. `page_listing` answered a bare array of pages, and a list's tasks answered `last_page`.
- Import, with notes, of a task and a Doc page wrote `raw/clickup/<task id>/` and `raw/clickup/<doc>.<page>/` snapshots, a note each, and a receipt; a third task, imported with `--no-notes`, wrote only its snapshot. ClickUp's task names can start with an invisible left-to-right mark, which the title keeps.
- After a description and a comment were added to the third task, and a line to the Doc page, a changed-only refresh skipped the unedited task (its `date_updated` unchanged), and wrote new snapshots of the other two, with the description, the comment, and the new line, and their notes; the first snapshots were left unchanged.
- No 429 was met in about 50 requests over twenty minutes.

## Callback route

ClickUp matches the redirect URL by its domain. The app registers the broker's host, `mesa-broker.guillecoto94.workers.dev`, whose callback is:

```
https://mesa-broker.guillecoto94.workers.dev/callback/clickup
```

and, for a local broker under `wrangler dev`, `localhost:8787`. The broker relays the callback to Mesa's loopback listener, as for Atlassian.

## Setup (human, once)

1. A Workspace owner or admin creates the app in ClickUp: Settings > ClickUp API > ClickUp API Settings > Create an App, named Mesa, with the redirect URL above.
2. Copy its client id and secret into the broker: `pnpm -C apps/broker exec wrangler secret put CLICKUP_CLIENT_ID`, then `CLICKUP_CLIENT_SECRET`, and deploy with `pnpm -C apps/broker deploy`. For a local broker, put them in `apps/broker/.dev.vars` (git-ignored) and run `pnpm -C apps/broker exec wrangler dev --port 8787`, with `MESA_BROKER_URL=http://localhost:8787` in Mesa's environment.
