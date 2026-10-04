# ADR-0021: One session can work across several projects

Status: accepted
Date: 2026-10-03

## Context

A Session (`CONTEXT.md`) runs in one Project and at most one Worktree. Work that spans two repositories (a client and its API, a library and the app that uses it) needed two sessions that could not see each other's files, or one agent pointed by hand at a folder Mesa did not know about, so nothing held that folder and nothing cleaned it up.

Each agent Mesa runs has a native flag that gives it another folder: Claude Code's `--add-dir <directories...>` (variadic), Codex's `--add-dir <DIR>` (writable alongside the primary workspace, also on `resume` and `fork`), and Antigravity CLI's `--add-dir` (repeatable). Mesa qualified Antigravity at 1.2.12; the flag is on 1.2.16.

Deps stay injected (ADR-0008), the pointer stays under 1,000 bytes (ADR-0010), and a project's setup is approved before anything is created (ADR-0013).

## Decision

- **Data model.** `project` stays the primary: where the agent runs, its tmux session, the board group, and the scope of vault writes and receipts. A record may hold `additional: [{project, worktree: {path, branch, base?}}]`, at least one entry, sharing one `WorktreeSchema` with `worktree`. The schema's refine checks structure only: no `additional` on a General record or one without `worktree`, no duplicate project, none equal to the primary. That they share one branch is checked at open. Replacing `project` with `projects[]` was rejected: more than 50 readers, and a migration.
- **No migration.** Absent means none, as `worktree` and `archivedAt` were before it; no `.default([])`, which would write `additional: []` into every record and break a downgrade. A mesa older than this refuses a record that holds `additional`.
- **`--with` always means worktrees on one branch.** `mesa open <project> --with <other> [--with ...]` without `--branch` implies `--worktree`, so Mesa names one `session/<words>-<4>` branch for every project. `--base` applies to every new branch; otherwise each project starts from its own default (ADR-0013). An existing branch is reused per repository, and `--base` with one is refused per repository, as for a single project. Each project gets its own setup, sparse checkout and carry-over.
- **Preflight, then create, then roll back what this launch made.** Before the first `git worktree add`, every `--with` is registered, named once, not the primary and not with `--general`; each project's setup is approved (`needs_approval`); each folder is the top of a git repository; and the command fits tmux's limit with the planned worktree paths. Then the primary's worktree is made, then each other one in order, each written to the record as it is made. When a later step fails, every worktree this launch made whose setup did not run is removed with any branch it made; one whose setup ran is kept and named in the error; and the new record is removed. One owner: `packages/core/src/sessions/additional.ts`.
- **One holder rule.** `heldWorktrees(record)` in `sessions/holders.ts` (the primary's worktree, then each additional one) is what `worktreeHolder`, `checkoutHolders`, `requireOwnWorktree` and `worktrees/lifecycle.ts`'s `references` read.
- **Launch flags.** Claude gets `--add-dir=<path>` per folder before the goal (the `=` form, as `--add-dir` takes every word after it, the goal too, as ADR-0012 does for `--mcp-config=`); Codex `--add-dir <path>`, after `-C` for resume and fork; agy `--add-dir=<path>`. `startCommand` and `startClaudeBackground` take the folders as `dirs`, and every caller passes `additionalDirs(record)` from `sessions/additional.ts`, the one owner of that mapping: open (with the planned paths for the length check), handoff, swap, and a queued start. `addDir` in `AGENT_CAPABILITIES` gates `--with`; a plain terminal refuses it.
- **Antigravity** is supported: the live check below passed, so its `addDir` is true.
- **Skills** are linked into each additional worktree too; a failure is a warning.
- **Pointer.** The agent's pointer adds one `Also in projects ...` line, naming as many as fit under the 1,000-byte cap and then `and N more`. To make room in the worst case, the skills line says `invoked here as` instead of `invoked in this terminal as`.
- **Scope.** Vault writes and receipts stay scoped to the primary; the open receipt names the rest (`inputs.with`, `outputs.additional`). Readers that ask which sessions touch another project are #499.
- **CLI.** `mesa open <project> --with <project> [--with ...]`, refused with `--general`, `--checkout` and `--terminal`, each a usage error. A positional `mesa open A B C` was rejected.
- **Queue, fork and removal (#498, 2026-10-03).** `--after` with `--with` queues the session with `pending.with`; its start checks the projects again and makes the worktrees through the same `createAdditional` and rollback. `mesa fork <id> --branch <name>` gives every project a worktree on that branch, each new one from that project's source worktree HEAD (`--base`, when given, for every project, as at open); without `--branch` it is a usage error, as a fork sharing several worktrees with its source would leave two sessions in them. `mesa rm --delete-worktree [--delete-branch]` removes every held worktree and branch, all or nothing: every holder check and, without `--force`, a `git status` of each worktree come before anything is removed, since git's own refusal would come only after an earlier repository's worktree was gone.
- **App.** One shared `AdditionalProjectsField` in `features/sessions/fields/`, used by the project composer and the empty Sessions composer; Session details lists `Also in` with each project and its worktree path.

## Evidence

The `--help` lines, read 2026-10-03:

- `claude --help` (2.1.289): `--add-dir <directories...>  Additional directories to allow tool access to`
- `codex --help` (codex-cli 0.160.0): `--add-dir <DIR>  Additional directories that should be writable alongside the primary workspace`; the same on `codex resume --help` and `codex fork --help`.
- `agy --help` (1.2.16): `--add-dir  Add a directory to the workspace (repeatable) (default [])`

Live check (#497 test plan steps 8 and 9) with the built CLI, a throwaway profile and two invented git projects `alpha` and `beta`: `mesa open alpha --with beta --worktree --goal "List the files at the top of the beta worktree, then create NOTE.md there"`, then `mesa show <id> --json` and a search for `NOTE.md` in both main checkouts and all worktrees.

| Agent | Version | `additional` in `mesa show` | NOTE.md only in beta's worktree | Prompts |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.289 | yes | yes | Claude's folder trust prompt for alpha's worktree, answered once. None for the added folder. |
| Codex | 0.160.0 | yes | yes, once the repository ran writable | With a fresh `CODEX_HOME`, Codex exited at once: `Ignoring --add-dir (...) because the effective permissions do not allow additional writable roots. Switch to workspace-write or danger-full-access to allow them.` An untrusted repository runs read-only, and Codex checks `--add-dir` before its trust prompt. With `agents.codex.sandbox: workspace-write` it showed its trust prompt (answered once) and wrote the file; once the repository was trusted it started with `--add-dir` without that setting. |
| Antigravity CLI | 1.2.16 | yes | yes | agy's folder trust prompt for alpha's worktree and a one-time "Run this command?" for `git status`, both answered once. It first looked at sibling worktrees from the earlier runs, and reading one asked for access "outside workspace"; once pointed at the added worktree, creating the note asked only the ordinary "Allow creation of this file?", so the added folder was in its workspace. |

#498's live check (claude 2.1.289, the same two invented projects): `mesa open alpha --with beta --worktree`, `mesa stop`, then `mesa rm <id> --delete-worktree --delete-branch --json` left only `main` in `git worktree list` and `git branch` of both; a session queued with `--after <id> --with beta` started with both worktrees once its target stopped; `mesa fork <id> --branch try/x` started beta's `try/x` at beta's source worktree HEAD, not alpha's; and an untracked file in beta's worktree refused `mesa rm --delete-worktree --delete-branch` with both worktrees, both branches and the record left in place.

The same run showed `mesa worktrees list beta --json` with the session as the beta worktree's holder, `mesa worktrees preview beta <path> --action remove --json` with `allowed: false`, and `mesa open beta --branch <same>` as a usage error naming the session.

## Consequences

- A session's other repositories are held, listed and cleaned up as its own worktree is, and every agent sees them from its first prompt.
- A mesa older than this refuses a record with `additional`.
- Codex's first `--with` session in a repository it has not trusted exits at once, with Codex's own message in the pane. Trusting the repository in Codex once (any plain Codex session there), or `agents.codex.sandbox: workspace-write`, avoids it.
- Since #499, board badges, git insight, PR events, project sort, session goals, search and vault scoping count every project of a session (`sessionProjects` in `sessions/session-projects.ts`, with `heldWorktrees`); fork, queued start and worktree deletion across several projects came in #498.
