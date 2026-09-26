# Mesa glossary

Shared vocabulary for issues, code, receipts, and screens. Use these terms as written. Each entry names the synonyms to avoid so the same thing is never called two names.

## Profile

A named configuration under `~/.mesa/<name>/`: `config.yaml` (`vault` path, `defaultAgent`, enabled `skills`, `decisions.backend` and `decisions.threshold` (the confidence below which the rules backend defers to the adapter, ADR-0003), `sessions.log` (continuous output logging for sessions), `terminal.app` (the app `mesa attach --app` opens: `Terminal` by default, `iTerm`, `Ghostty`, or `WezTerm`), and `keys` (literals or `env:VAR` references, always printed as `***`)), `registry.yaml`, and `sessions/`. `mesa init` creates it; `mesa config` reads and edits it. Exactly one vault per profile. `default` is created on first run; `mesa --profile work` or `MESA_PROFILE=work` selects another. Work and personal are two profiles, never one shared vault.
Not: workspace, account, environment.

## Vault

The Obsidian vault a profile owns. Layout: `raw/` (immutable inputs), `wiki/` (agent-written knowledge), `projects/`, `receipts/`, `daily/`, `AGENTS.md` (the vault's own schema), `index.md`, and an append-only `log.md`. Mesa writes files; Obsidian renders them. `mesa vault init` lays the layout out (only what is missing; a folder that is neither empty nor a vault needs `--force`), and `mesa vault status` lists what is missing. The notes Mesa writes after that (daily notes now, receipts next) go through `writeNote`: atomically (a temp file, flushed, then a rename), with `created`, `updated` (local `YYYY-MM-DDTHH:mm`, the form Obsidian infers as Date & Time), and `source: mesa` in the frontmatter, and never over a note whose frontmatter says `locked: true`. Read-modify-write updates of shared notes run under the vault lock, `.mesa/lock` in the vault. `mesa log` appends one line to `log.md` (append-only) and to today's daily note. `mesa vault open [note]` opens the vault, or one note, in Obsidian through its `obsidian://open` URI (`--cli` uses the Obsidian CLI when it is registered); Obsidian must already know the vault ("Open folder as vault" once). Vault content never enters this repo.
Not: notes folder, knowledge base, memory (memory is what the vault holds, not the vault).

## Project

A repository registered with a profile through its `mesa.yaml`: `name` (a slug, unique in the profile), preferred `agent`, `priority` (0 to 1, feeds the attention score), `guardrail` (`normal` or `strict`), `tmux.layout`, and extra `skills`. A project has zero or more sessions.
Not: repo (a repo becomes a project once registered), workspace.

## Registry

A profile's `registry.yaml`: one entry per project, its name and the directory holding its `mesa.yaml`. `mesa projects` reads it; `mesa register <path>` appends to it; `mesa unregister <name>` removes an entry.
Not: project list, index.

## Agent

The CLI coding agent a session runs: `claude` (Claude Code) or `codex` (Codex CLI). v1 ships `claude` only; `codex` is added in P3 (ADR-0003 amendment).
Not: model, assistant, bot.

## Session

One agent process for one project, running or resumable. Fields: Mesa session id (8 lowercase characters, typed in `mesa stop <id>`), `kind` (`interactive` or `run`), agent, project, agent session id (Claude Code session UUID or Codex thread id), `goal` (its first prompt, see Goal), its tmux socket, session, and window, start time, end time once stopped, last state with its confidence and source, last output tail, and `resumedFrom`/`resumedBy` links. Backed by one tmux window. Persisted as `~/.mesa/<profile>/sessions/<id>.json`. `mesa open <project> [--agent claude] [--goal <text> | --goal-file <path>] [--attach]` starts one: it writes the record, then runs `claude --session-id <uuid> [<goal>]` in window `claude-<id>` of the project's tmux session, and writes a `session` receipt. `mesa sessions` lists them, highest attention first, with `alive` (the window exists, or the agent listing names the session) and `agentStatus` (the listing's `idle`, `busy`, or `waiting`, while it lists the session): every session not stopped, and those stopped within the last day; `--all` adds older ones. A session has ended when it was stopped (`mesa stop [--force]`: the agent's `/exit`, up to 5 s for it to quit, then `kill-window`; it sets `endedAt`); one whose window vanished (a crash, a reboot) is marked `done` from tmux but has not ended, so it stays on the board to resume. `mesa resume <id>` reopens an ended session's conversation (`claude --resume <agent session id>`) in a new window as a new session, linked by `resumedFrom` and `resumedBy`. `mesa send <id> <prompt> [--force]` types a prompt into a live session's agent (one literal chunk, then Enter) and adds a `send` event to its record; it refuses a pane running a shell, and an agent waiting on a person, unless forced. `mesa hooks install|status|uninstall` manages Mesa's entries in `~/.claude/settings.json` (8 events, ADR-0003); each runs `mesa hook claude`, which, inside a Mesa session only, appends the payload (secret-named keys and the home directory redacted) to `sessions/events/<id>.jsonl` and fills in the record's agent session id. `kind: run` is a headless run (`claude -p`), still a session.
Not: task, job, run (`kind: run` qualifies a session, it is not another name for one), thread (thread is Codex's word for its own id).

## Goal

A session's first prompt, given at start: `mesa open <project> --goal "<text>"`, or `--goal-file <path>` (read as UTF-8, otherwise unchanged), or the Goal field of the Board's New session dialog. It reaches `claude` as one argument, `claude --session-id <uuid> <goal>`, quoted for `/bin/sh`, which runs every Mesa window whatever the user's shell. So the session starts working without anyone typing into it. A goal starting with `/goal` runs Claude Code's goal command, which keeps the agent working until its condition holds. The record keeps it as `goal`, `mesa goal <id>` prints it, and the Board shows its first line under the project. A resumed session keeps its goal, but it is not sent again. A goal is refused, with a failed receipt, when it is blank, starts with `-`, holds a NUL byte, or makes the command longer than the 12000 bytes Mesa passes to tmux (one tmux command holds about 16 KiB). The session receipt keeps its first 80 characters, key values redacted.
Not: task, prompt (a goal is one prompt, the first), objective.

## Foreign session

A live agent session Mesa did not start: a `claude` run in a plain terminal, or by another tool. `claude agents --json` lists every live Claude Code session on the machine. A listed process that runs in no open Mesa session's window, and whose agent session id no open session of this profile holds, is foreign, unless another profile's records hold that id. `mesa sessions` and the board show foreign sessions among Mesa's, by attention, read-only. Each gets id `ext-<pid>`, `managed: false`, a state read from the listing alone (0.85, ADR-0003), and a project. The project is the registered one it runs in (its folder or one inside it), else a project named like its folder, else none. `stop`, `send`, `resume`, `attach`, and `goal` refuse an `ext-` id as `not_found` with "session not managed by mesa". Adopting one into Mesa is out of scope.
Not: orphan (a Mesa session whose window vanished is still Mesa's, marked `done`).

## Window

The tmux window one session runs in, on the profile's own tmux server (socket `mesa-<profile>`, ADR-0001). The tmux session holding it is named after the project; the window is named `<agent>-<Mesa session id>` (`claude-a1b2c3d4`). A window whose agent exited stays, dead, with its output. `mesa windows [project]` lists them, and the Doctor screen shows them. `mesa attach <session>` shows a session's window in this terminal. Each terminal gets its own view session (`_view-<id>`), grouped with the project's session: it has the same windows but its own current window. tmux drops the view when the terminal detaches, and the board and `mesa windows` never list views. Attaching to the project's session itself would switch every attached terminal to that window. `--app` opens it in the app the config key `terminal.app` names, through `open -a <app> <script>`. `--print` prints the attach argv instead, and the app's embedded terminal runs that argv. Without a terminal on stdin, and with neither flag, it is a usage error. `mesa resize <session> <cols> <rows>` sizes the window to a view now, then hands sizing back to tmux's `window-size latest`, so from then on the client used last (attached or typed in) sizes it (ADR-0001 amendment). Mesa's server sets its windows up for the app's embedded terminal, as Xirp does (SP-3): `mouse on` (the wheel scrolls tmux's history), `status off`, and `set-clipboard external` (a copy goes out as OSC 52). A drag's copy is also piped to `pbcopy`, so it reaches the pasteboard in any client, Terminal.app included. In the app, Option-drag selects in xterm itself.
Not: pane, tab. A tmux session is a project's group of windows, never a Mesa session.

## Session state

Where a session is right now, one of: `working`, `waiting-permission`, `waiting-question`, `idle`, `done`, `failed`. On every look at the board, Faro classifies it (`classifySession`) and attaches a confidence and a source. The rules come first, in ADR-0003's order:

- A stopped session keeps its state.
- A dead or vanished window is a process fact (0.85): `failed` with a signal or a nonzero status, else `done`.
- Next comes the latest hook event: 0.95 under a minute old or when the listing agrees, 0.8 when stale. A wait more than 2 s old yields to a listing that says the agent moved on.
- Then the agent listing (0.85).
- Then the tail, the pane's last 30 lines read with CCManager's Claude Code patterns (0.6). The tail is read only when no hook or listing speaks.

When the least sure answer is below `decisions.threshold`, the adapter (`claude -p`) is asked, and its state is the row's, with source `adapter`. The adapter's answer is saved with a `basis`, a hash of what it saw, and it is not asked again while that is unchanged. Foreign sessions use rules only. A new state is saved in the record, with the time it began: the hook event's time, else when the board first saw it. `waiting-permission` and `waiting-question` are the states that need a human.
Not: status, phase, mode.

## Attention score

A number from 0 to 1 per session: how urgently the user is needed. Faro computes it as a `Score` over the levels none, low, medium, high, and urgent, from the state, the time in that state, and the project's `priority`. The bands never overlap across states:

- A waiting session starts at 0.75 and climbs to urgent over five minutes, and with priority.
- A failed session is 0.5 to 0.67, growing over ten minutes.
- An idle session is 0.25 to 0.42, growing over ten minutes.
- A done session is 0.25.
- A working session is 0 to 0.125.
- A stopped session is 0.

So a wait always outranks every other state. The board sorts by it, highest first.
Not: priority, urgency, rank.

## Board

The Session Board: the app's first screen (BoardScreen) and the output of `mesa sessions` (id, project, agent, state, confidence as a percent, attention, running time, last output; `--json` adds each row's `decision` with its probabilities). Every session across every project, highest attention first. Each row shows:

- a state badge coloured per state, with its confidence (hover: which decisions backend decided);
- the attention score;
- a running time that ticks between looks;
- the last output line of its pane.

Foreign sessions are muted and tagged "not managed", with no actions. Clicking a live session's id opens its terminal in the app, under the board, and several can be open at once. This embedded terminal is xterm.js over a pty running `mesa attach --print`'s argv. It shows the 256-colour palette. A tmux copy reaches the pasteboard, Cmd+V pastes, and Close ends only the tmux client. Actions: New session (a modal dialog with a registered project, an agent, and an optional goal), and per row:

- Send (inline, Enter or the button sends);
- Open terminal (`mesa attach --app`);
- Stop;
- Resume, once the agent has exited: stopped, its window gone, or its pane dead.

The app looks again every 2 s and at once after every action, one look at a time: a look asked for during one runs right after it. A failure shows in the toast.
Not: dashboard, overview, list.

## Skill

A folder with a `SKILL.md` that either agent can load. Repo skills live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex). Skills Mesa ships live in `skills/` and are installed into a profile's enabled set.
Not: plugin, command, tool, prompt.

## Receipt

A markdown note with YAML frontmatter in the vault's `receipts/YYYY/MM/`, written after every action that changes something (and every one that fails), skill run, session, and decision. `type` (`session`, `skill`, `decision`, `action`), a ULID `id`, `status` (`ok`, `failed`, `blocked`), the redacted `command`, and every Faro decision with its probabilities; the schema and one example per type are in `docs/receipts.md`. Receipts are the audit trail: each adds a `log.md` line with a `[[wikilink]]` to it, and `mesa receipts` lists them.
Not: log entry, record, artifact.

## Decision

One call to Faro: `decide(state, questions)` returning one answer per question with a probability distribution and a confidence. Question primitives: `Choice` (pick one of 2 to 255 options), `Score` (a position from 0 to 1 on an ordered rubric of 2 to 10 levels), and `Noul` (yes or no as one calibrated probability, with no separate confidence). Fixed in ADR-0004. A Decision keeps the questions, the answers, the backend that answered (`rules-fallback` when the named backend was asked and failed), what the call cost (`costUsd`, adapter only, for information), when, and how long it took. Each decision site brings its own rules backend, which answers first; the backend the profile names is asked only when the least sure answer is below `decisions.threshold` (ADR-0003). `mesa decide` asks from the command line (questions on stdin, even answers, since no rules know them) and records nothing; the Doctor screen shows which decisions backend is in use. Decisions reach receipts, with their probabilities, through a `DecisionRecorder` (P3).
Not: judgment, classification, inference, prediction.

## Faro

The decisions layer, `packages/core/src/decisions`. Used for session state, attention score, guardrail checks before external actions (send, push, delete), vault ingest routing, and free-text request routing.
Not: the AI, the brain, the classifier.

## Backend

A swappable implementation behind an interface. Two kinds, always qualified: the **decisions backend** (`rules`, `adapter`, `jev`) and the **session backend** (`tmux`). Say which one.
Not: provider, driver, engine.

## Guardrail

A decision Faro makes before an external action (send a prompt, push, delete): allow, ask, or block, with confidence. Recorded in the action's receipt. A project's `guardrail` level in `mesa.yaml` (`normal` or `strict`) is an input to that decision, not a guardrail itself; `strict` projects get the stricter gate built in P3.
Not: safety check, policy, filter.

## Composition root

`createMesa(profile, deps)` in `packages/core/src/mesa.ts`: builds every Mesa service for one profile from `MesaDeps` (home, cwd, clock, id source, UUID source (the agent session ids Mesa hands to claude), environment, process runner, Obsidian paths, and the invocation's argv for receipts). The CLI entrypoint (`packages/cli/src/mesa.ts`) builds the real deps; tests build them with `testDeps`. The app never builds them: it reaches Mesa through the bridge, and its entrypoint `main.tsx` only picks the real bridge and platform (dialogs, terminals, the pasteboard). ADR-0008.
Not: container, context, app.

## Seam

A place where Mesa's behaviour can change without editing the code there: the process runner, the clock, the id source, the UUID source, the home directory, the app's bridge. Each seam has a real implementation and a test one (`@mesa/core/testing`, `renderWithMesa`). Say implementation, not adapter: the adapter is a decisions backend.
Not: boundary, interface (the interface is what a caller must know; the seam is where it lives).

## Bridge

The app's seam to the mesa CLI: a function from an argv to the envelope mesa printed. The real one calls the Rust `run_mesa` command; tests pass a fake. The app's client is built over it.
Not: IPC, API, backend.
