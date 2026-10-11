# GitHub

Mesa connects to GitHub as a GitHub App, Mesa for Tickets (`mesa-for-tickets`), through its broker (ADR-0014). `mesa sources connect github`, or Connect in Settings > Connections (or in a project's Tickets tab), opens GitHub's sign-in in the default browser; the token goes in the macOS Keychain. GitHub Issues is a tracker (CONTEXT.md, Tracker): a project's Tickets tab lists, shows, assigns and starts sessions from the issues of the repos it follows. Mesa's one write to GitHub is adding the signed-in person as an assignee (Assign to me), with a receipt.

## Permissions

A GitHub App has no OAuth scopes: what its user tokens can do is set on the app. Mesa for Tickets asks for Issues read and write, and the Metadata read every app has. A token acts as the person, and reaches only the repos the app is installed on (on each org or account, all repos or picked ones) that the person can see. The authorize URL is `https://github.com/login/oauth/authorize` with `client_id`, `redirect_uri`, and `state`, and nothing else.

Installing is separate from signing in. Once signed in, Mesa reads the repos it reaches live (`GET /user/installations?per_page=100`, then `GET /user/installations/<id>/repositories?per_page=100` for each, page by page), so installing on a new repo needs no reconnect. When a sign-in reaches no repo, the Tickets tab's tracker choice sends the person to the app's installation page, `https://github.com/apps/mesa-for-tickets/installations/new`, and the Follow dialog's "Give Mesa access on GitHub" and the gear's "Manage access" open the same page; coming back to the window reads the repos again.

## Token lifetime and refresh

From [Generating a user access token for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app) and [Refreshing user access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens) (read 2026-10-11): with "Expire user authorization tokens" on, the token answer (`POST https://github.com/login/oauth/access_token`, a form with `client_id`, `client_secret`, `code`, and `redirect_uri`; `accept: application/json` for a JSON answer) has `access_token` (`ghu_`), `expires_in` (28800, 8 hours), `refresh_token` (`ghr_`), `refresh_token_expires_in` (15897600, 6 months), `scope` (empty), and `token_type`. A refresh (`grant_type=refresh_token`) answers a new pair and ends the old one, so refresh tokens rotate. So the Keychain item holds both tokens, the expiry, the account as its one site, and the status; the authorized fetch refreshes a minute before the expiry, or on a 401.

GitHub answers a refused grant with HTTP 200 and an `error`: `bad_verification_code` for a code, `bad_refresh_token` for a used or expired refresh token. The broker passes it back as is, and Mesa reads either as refused: a sign-in says to try again, a refresh marks the connection needs-reconnect.

## What the Tickets tab reads

What a project follows in GitHub is a repo: each followed repo is a Ticket view (`mesa tickets views add --provider github`), named after the repo, of one repo's issues narrowed by labels (every one), one milestone (or none), whose (only the person's, by default) and whether closed ones show. `--repo owner/repo` names it, or `--project` takes the project's origin remote on github.com (`git remote get-url origin`, https or ssh). A milestone is given by its title, its number, or `none`, and kept by number with its title.

- List: `GET /repos/<owner>/<repo>/issues?state=open|all&assignee=<login>&labels=<a,b>&milestone=<number|none>&per_page=100`, one page of 100 (the count says "100+" past it). GitHub's issue list holds pull requests too; those, with a `pull_request` key, are left out. The Follow dialog shows this request under Advanced. Open issues group as Open, closed ones as Closed.
- Panel: `GET /repos/<owner>/<repo>/issues/<number>` and its comments, `GET .../comments?per_page=100`, page by page: State, Assignees, Labels in their colors, Milestone, Repository, the body (GitHub's Markdown), and the comments, with Open in GitHub.
- Assign to me: `POST /repos/<owner>/<repo>/issues/<number>/assignees` with `{assignees: [<login>]}`, which adds the person beside the issue's other assignees. GitHub drops, without an error, an assignee who cannot be assigned in the repo, so Mesa checks the answer and says so.
- The Follow dialog's repos: the reachable repos above, the project's origin remote first; its labels, `GET /repos/<owner>/<repo>/labels`, and open milestones, `GET .../milestones?state=open` (`mesa tickets repos`, `mesa tickets repo <owner/repo>`).

A ticket's key is `owner/repo#123`, its id `github:owner/repo#123`; the list and panel show `#123`, with the repository in the panel. A session's branch is `issue-123`.

## What an import reads

`mesa import <link>` (CONTEXT.md, Import), with GitHub connected, takes an issue, as `https://github.com/<owner>/<repo>/issues/<number>` or its key `owner/repo#123`. Snapshots go to `raw/github/<owner>/<repo>/<number>/`, titled `owner/repo#123: <title>`, with the state, assignees, labels, milestone, author, created and updated times, the body, and every comment. Its revision is `updated_at`, which a new comment moves too. Without GitHub connected, a github.com link imports as a public web page, as before; any other github.com page always does. Start session from a GitHub issue in the Tickets tab imports it this way, and the session's record keeps `from: {source: github, id: owner/repo/123}`, which its Live dot matches.

## What a browse reads

`mesa sources browse github` (CONTEXT.md, Picker), node ids `repo:<owner>/<repo>` (`sources/github-tree.ts`): the root lists the reachable repos, whole; a repo its open issues, pull requests left out, `GET /repos/<owner>/<repo>/issues?state=open&per_page=25&page=<n>`, the cursor the next page number. Issues import; repos only hold them. A search keeps the repos, or a page's issues, whose name holds it.

## Rate limits

A user token of a GitHub App gets 5,000 REST requests an hour. The tab reads one request per followed repo, the panel two (the issue and its comments), and the Follow dialog's live count one per change.

## Callback route

The app's callback URLs:

```
https://mesa-broker.guillecoto94.workers.dev/callback/github
http://localhost:8787/callback/github
```

the second for a local broker under `wrangler dev`. The broker relays the callback to Mesa's loopback listener, as for Atlassian.

## Setup (human, once)

1. The GitHub App Mesa for Tickets (`mesa-for-tickets`) exists, with the callback URLs above, "Expire user authorization tokens" on, "Request user authorization (OAuth) during installation" off, the webhook off, and Repository permissions Issues read and write (Metadata read is added by GitHub).
2. Copy its client id and a client secret into the broker: `pnpm -C apps/broker exec wrangler secret put GITHUB_CLIENT_ID`, then `GITHUB_CLIENT_SECRET`, and deploy with `pnpm -C apps/broker deploy`. For a local broker, put them in `apps/broker/.dev.vars` (git-ignored) and run `pnpm -C apps/broker exec wrangler dev --port 8787`, with `MESA_BROKER_URL=http://localhost:8787` in Mesa's environment.
3. The installation page Mesa opens is the app's own (`GITHUB_INSTALL_URL` in `packages/core/src/sources/github.ts`); a self-hosted broker with its own GitHub App changes it there.

Not yet run live: the live check waits for the client id and secret in the broker.
