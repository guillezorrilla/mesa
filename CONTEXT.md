# Mesa glossary

Shared vocabulary for issues, code, receipts, and screens. Use these terms as written. Each entry names the synonyms to avoid so the same thing is never called two names.

## Profile

A named configuration under `~/.mesa/<name>/`: `config.yaml` (`vault` path, `defaultAgent`, enabled `skills`, `decisions.backend` and `decisions.threshold` (the confidence below which the rules backend defers to the adapter, ADR-0003), `sessions.log` (continuous output logging for sessions; read by nothing until #37), `terminal.app` (the app `mesa attach --app` opens: `Terminal` by default, `iTerm`, `Ghostty`, or `WezTerm`), and `keys` (literals or `env:VAR` references, always printed as `***`)), `registry.yaml`, and `sessions/`. `mesa init` creates it; `mesa config` reads and edits it. Exactly one vault per profile. `default` is created on first run; `mesa --profile work` or `MESA_PROFILE=work` selects another. Work and personal are two profiles, never one shared vault.
Not: workspace, account, environment.

## Vault

The Obsidian vault a profile owns. Layout: `raw/` (immutable inputs), `wiki/` (agent-written knowledge), `projects/`, `receipts/`, `daily/`, `AGENTS.md` (the vault's own schema), `index.md`, and an append-only `log.md`. Mesa writes files; Obsidian renders them. `mesa vault init` lays the layout out (only what is missing; a folder that is neither empty nor a vault needs `--force`), and `mesa vault status` lists what is missing. The notes Mesa writes after that (daily notes and receipts) go through `writeNote`: atomically (a temp file, flushed, then a rename), with `created`, `updated` (local `YYYY-MM-DDTHH:mm`, the form Obsidian infers as Date & Time), and `source: mesa` in the frontmatter, and never over a note whose frontmatter says `locked: true`. Read-modify-write updates of shared notes run under the vault lock, `.mesa/lock` in the vault. `mesa log` appends one line to `log.md` (append-only) and to today's daily note. `mesa vault open [note]` opens the vault, or one note, in Obsidian through its `obsidian://open` URI (`--cli` uses the Obsidian CLI when it is registered); Obsidian must already know the vault ("Open folder as vault" once). Vault content never enters this repo.
Not: notes folder, knowledge base, memory (memory is what the vault holds, not the vault).

## Project

A repository registered with a profile through its `mesa.yaml`: `name` (a slug, unique in the profile), preferred `agent`, `priority` (0 to 1, feeds the attention score), `guardrail` (`normal` or `strict`), `tmux.layout` (accepted, read by nothing yet), and extra `skills`. A project has zero or more sessions.
Not: repo (a repo becomes a project once registered), workspace.

## Registry

A profile's `registry.yaml`: one entry per project, its name and the directory holding its `mesa.yaml`. `mesa projects` reads it; `mesa register <path>` appends to it; `mesa unregister <name>` removes an entry. Both rewrite it whole, under `registry.yaml.lock`, so two at once keep both changes.
Not: project list, index.

## Agent

The CLI coding agent a session runs: `claude` (Claude Code) or `codex` (Codex CLI). v1 ships `claude` only; `codex` is added in P3 (ADR-0003 amendment).
Not: model, assistant, bot.

## Session

One agent process for one project, running or resumable. Fields: Mesa session id (8 lowercase characters, typed in `mesa stop <id>`), `kind` (`interactive` or `run`), agent, project, agent session id (Claude Code session UUID or Codex thread id), `goal` (its first prompt, see Goal), `parent` (see Parent session), `after` and `pending` (see Queued session), `handoffFrom` (see Handoff), `worktree` (see Worktree), `name`, `adopted` and `cwd` (see Adopted session), its tmux socket, session, and window, start time, end time once stopped, last state with its confidence and source, `context` (see Context use), last output tail, `events` (the prompts it was sent, `send`, and sent, `sent`, its agent's exit, `exited`, and a `handoff`), and `resumedFrom`/`resumedBy` links. Backed by one tmux window. Persisted as `~/.mesa/<profile>/sessions/<id>.json`. `mesa open <project> [--agent claude] [--goal <text> | --goal-file <path>] [--parent <id> | --no-parent] [--after <id>] [--branch <name> [--base <ref>]] [--attach]` starts one (with `--after`, queues it, see Queued session): it writes the record, then runs `claude --session-id <uuid> [<goal>]` in window `claude-<id>` of the project's tmux session, in the project's folder or, with `--branch`, in its own worktree, with the project's enabled skills linked there first (see Skill), and writes a `session` receipt. `mesa sessions` lists them, highest attention first (`--tree` puts children under their parent), with `alive` (the window exists, or the agent listing names the session) and `agentStatus` (the listing's `idle`, `busy`, or `waiting`, while it lists the session): every session not stopped, and those stopped within the last day; `--all` adds older ones. A session has ended when it was stopped (`mesa stop [--force]`: the agent's `/exit`, up to 5 s for it to quit, then `kill-window`; it sets `endedAt`); one whose window vanished (a crash, a reboot) is marked `done` from tmux but has not ended, so it stays on the board to resume. Mesa's tmux server also has a `pane-died` hook (set when Mesa starts the server, and on each look at a board with sessions): the moment an agent exits, it runs `mesa hook tmux pane-died <project> <window>`, which records the exit at once, `done`, or `failed` for a nonzero exit status or a signal, with source `tmux-hook` and an `exited` event. The session is not stopped by it: it keeps its place on the board, its last screen, and Resume, and `mesa stop` still removes its window. `mesa show <id>` prints one record with `alive` (as the board reads it). `mesa rename <id> <name>` stores `name`, which `mesa sessions` and the Board show in place of the id (the id stays on hover, and in `--json`). `mesa rm <id> [--force] [--delete-worktree] [--delete-branch]` removes the record and its hook log; it refuses a live session unless `--force`, which closes its window first; `--delete-worktree` runs `git worktree remove` (git refuses one with changes unless `--force`), `--delete-branch` deletes its branch, and neither touches a worktree a session resumed from it has now; every refusal comes before the record goes, and `--json` says what was removed. The Board's row menu has Rename and Remove, which confirms by listing what goes and removes only an ended session. `mesa resume <id>` reopens an ended session's conversation (`claude --resume <agent session id>`) in a new window as a new session, linked by `resumedFrom` and `resumedBy`. `mesa send <id> <prompt> [--force] [--from <sender> | --no-from]` types a prompt into a live session's agent (one literal chunk, then Enter) and adds a `send` event to its record; it refuses a pane running a shell, and an agent waiting on a person, unless forced. From another session (`--from`, else the Mesa window it runs in, as for a Parent session; `--no-from` sends as a person, and the Board's Send passes it), the prompt starts with one header line, `[mesa] from session <sender> (<project>). Reply with: mesa send <sender> "<reply>"`, so the receiver knows who asked and how to answer; the prompt itself is on the next line, so a slash command from another session is not run as one. Its `send` event names `from`, and the sender's record gets a `sent` event naming `to`; `chars` counts the prompt, not the header. An unknown sender is `not_found`; an ended one, and the receiver itself, are usage errors; and another session cannot force a prompt into a session waiting on a person, which only a person answers (ADR-0003). The Board lists each session's received prompts with their sender. `mesa hooks install|status|uninstall` manages Mesa's entries in `~/.claude/settings.json` (8 events, ADR-0003), and `status` also says whether the tmux server has its pane-died hook; `mesa doctor` checks both (`claude hooks`, `tmux hooks`); each runs `mesa hook claude`, which, inside a Mesa session only, appends the payload (secret-named keys and the home directory redacted) to `sessions/events/<id>.jsonl` and fills in the record's agent session id. A `/clear` starts a new conversation in the same agent, under a new agent session id: its `SessionStart` (source `clear`) moves the record to it, and each look at the board saves the id the agent listing names for the session's pane, so hooks keep logging and `mesa resume` reopens the conversation on screen. A hook under any other id is a nested claude's, and is dropped. `kind: run` is a headless run (`claude -p`), still a session; nothing creates one until #30.
Not: task, job, run (`kind: run` qualifies a session, it is not another name for one), thread (thread is Codex's word for its own id).

## Goal

A session's first prompt, given at start: `mesa open <project> --goal "<text>"`, or `--goal-file <path>` (read as UTF-8, otherwise unchanged), or the Goal field of the Board's New session dialog. It reaches `claude` as one argument, `claude --session-id <uuid> <goal>`, quoted for `/bin/sh`, which runs every Mesa window whatever the user's shell. So the session starts working without anyone typing into it. A goal starting with `/goal` runs Claude Code's goal command, which keeps the agent working until its condition holds. The record keeps it as `goal`, `mesa goal <id>` prints it, and the Board shows its first line under the project. A resumed session keeps its goal, but it is not sent again. A goal is refused, with a failed receipt, when it is blank, starts with `-`, holds a NUL byte, or makes the command longer than the 12000 bytes Mesa passes to tmux (one tmux command holds about 16 KiB). The session receipt keeps its first 80 characters, key values redacted.
Not: task, prompt (a goal is one prompt, the first), objective.

## Caller

The session whose Mesa window a `mesa` command runs in, read from the window's `MESA_SESSION_ID` and `MESA_PROFILE` (`callerOf`): a window of another profile, or of a removed session, is in a Mesa window with no session here. It is the default parent of a session `mesa open` starts, the default sender of `mesa send`, and, when it hands itself off, the reason its stop runs later from the tmux server. Outside a Mesa window there is none, and mesa acts for a person.
Not: parent (the parent is a link on a record; the Caller is who runs this mesa now).

## Parent session

The session another was started from. `mesa open` run inside a Mesa window of the same profile (its `MESA_SESSION_ID` and `MESA_PROFILE`) records that window's session as the new one's `parent`; a window of another profile, or of a removed session, gives none. `--parent <id>` names one, and an id that is not a session of this profile is `not_found`. `--no-parent` records none, and passing both is a usage error. The Board's New session passes `--no-parent`: a person starting one is not a session starting a child. A resumed session keeps its parent. `mesa sessions --json` gives every Mesa row its `parent` (absent when it has none) and its `children` (the ids of the sessions whose parent it is, on the board or not). `--tree` orders the rows as a tree, each with its `depth`: a row, then its children, then theirs. Siblings, and the rows at the top, rank by the highest attention in their subtree, so a child waiting on a person lifts its whole branch. A child whose parent is off the board sits under the session that parent was resumed as, else at the top, its `parent` kept. The Board shows the tree; a toggle collapses the rows under a row, and a collapsed row says how many it hides and marks one that waits on a person.
Not: owner, spawner, caller (the Caller is who runs mesa, which makes it the parent by default).

## Queued session

A session waiting to start until the session it waits on is over: `mesa open <project> --after <id> [--goal ...] [--branch ...]` writes its record, `queued`, with `after: <id>`, its `parent` defaulting to that session (`--parent` and `--no-parent` still win), and `pending`, the branch and base its worktree gets when it starts; it has no window, no worktree, and no agent session id yet, since it never ran. An id that is no session of this profile is `not_found`, and `--after` a session that is already over starts it at once. A session is over for its queue when it has ended (`endedAt`) or was seen `done`, `failed`, or `stopped`. No daemon: whichever signal first finds it over starts every session queued after it, through the steps `mesa open` takes, each with a `Started queued session` receipt: Claude Code's SessionEnd hook (`mesa hook claude`; a `/clear` or a `/resume` keeps the agent running and starts nothing), tmux's pane-died hook (`mesa hook tmux`), a `mesa stop` of it, or a look at the board that finds it over, or gone, which catches a missed signal. The starter claims it first, under the record's lock (`pending.claimedAt`, with its agent session id), so two signals at once start it once; a claim older than 30 s is taken again, as a start killed mid-way left it (a SessionEnd hook has 1.5 s), keeping its id and any window it opened. A start that fails leaves it `failed`, ended, with its new worktree removed and a failed receipt. `mesa stop` on a queued session cancels it: `stopped`, ended, and the sessions queued after it wait on what it waited on instead, so a chain keeps its order. `mesa rm` refuses a queued session until it is cancelled, as removing it would leave those waiting on nothing. `mesa sessions` shows `waiting on <id>` in place of its last output; the Board shows the same, with Cancel for Stop. Waiting on several sessions is out of scope.
Not: scheduled, deferred.

## Handoff

A session's work continued in a fresh successor, so long work never waits on a person to copy text between sessions. `mesa handoff <id> --note <file> [--keep]` copies the note to `~/.mesa/<profile>/handoffs/<successor id>.md` and opens the successor on the same project, with the same agent, in the same folder, taking over the session's worktree (and so its branch), with `parent` and `handoffFrom` the session, and a goal made of the session's own (an earlier handoff line dropped) plus `Read the handoff note at <path> first.`. Both records get a `handoff` event (`to` on the session, `from` on the successor, each with the note), and a `session` receipt records from, to, and the note; `--json` prints `{from, to, note}`. Then the session stops: at once, or, when it hands itself off from inside its own window, from Mesa's tmux server two seconds later (`run-shell -b`, running `mesa stop`), since its own stop would kill the `mesa handoff` running in it. `--keep` leaves it running, except a session in its own worktree, as two sessions never share one. A session without a goal is `usage`, a note that is not there `not_found`, and every refusal comes before anything is written. The `mesa-handoff` skill teaches an agent when and how: read its own `context.used` (see Context use) after each finished step, and at the threshold (55 unless its goal names another) write the note in four sections (Verified, with commands and results; Assumed; Left out on purpose; Blocked), hand off, and stop working. The Board's Hand off button asks for the note file.
Not: transfer, fork, relay.

## Worktree

The git worktree a session runs in when it is opened with `--branch <name>`, so parallel sessions on one project never edit the same folder. Mesa adds it at `~/.mesa/<profile>/worktrees/<project>/<name>` (a `/` in the branch becomes `-`), in the profile and never next to the project, and the project must be a repository's top folder. An existing local branch not checked out elsewhere is reused as it is, and `--base` with one is a usage error. A new branch starts from `--base <ref>`, else the branch of that name on origin, which it then tracks where git can, else origin's HEAD, else the current branch; it tracks nothing else, so a push from it never lands on the branch it started from. The record keeps `worktree: {path, branch, base}` (`base` only for a branch Mesa made), `mesa sessions` shows the branch after the project, and the Board shows it under the project. A resume runs in the same worktree, where claude keeps the conversation: it is `not_found` once the worktree is gone, and `usage` once a newer session has it, as two sessions never share one. Refusals are `usage`, with git's reason where git refused: a project that is not a git repository, a branch checked out in another worktree, a worktree a session has at that path (the newest such session is named), a name git would not take or would read as another branch (`@{-1}`), a path already taken or one git still lists as a worktree, or a ref git refuses. A missing git, or one that does not answer, is `internal`. Mesa claims the path with one `mkdir` and makes a new branch in its own step, so a failed or killed add, and a window that cannot open, remove the worktree Mesa made, and the branch only when Mesa made it, and nothing else. Without `--branch` a session runs in the project's folder. `mesa rm <id> --delete-worktree --delete-branch` removes a session's worktree and branch with it.
Not: checkout, clone, sandbox.

## Foreign session

A live agent session Mesa did not start: a `claude` run in a plain terminal, or by another tool. `claude agents --json` lists every live Claude Code session on the machine. A listed process that runs in no open Mesa session's window, and whose agent session id no open session of this profile holds, is foreign, unless another profile's records hold that id. `mesa sessions` and the board show foreign sessions among Mesa's, by attention, read-only. Each gets id `ext-<pid>`, `managed: false`, a state read from the listing alone (0.85, ADR-0003), and a project. The project is the registered one it runs in (its folder or one inside it), else a project named like its folder, else none. `stop`, `send`, `resume`, `attach`, and `goal` refuse an `ext-` id as `not_found` with "session not managed by mesa"; `mesa adopt` makes one Mesa's (see Adopted session).
Not: orphan (a Mesa session whose window vanished is still Mesa's, marked `done`).

## Adopted session

A Claude Code session started outside Mesa that Mesa then took in: `mesa adopt <agentSessionId> [--project <name>] [--name <text>] [--no-resume]`, or Adopt on a foreign row of the Board. Mesa finds it in the agent listing, else by its transcript, `~/.claude/projects/<folder>/<id>.jsonl`, and reads the folder it ran in from there. Its project is the one that folder is in, as for a foreign session; else `--project` places it; else it is `not_found`, and a `--project` other than the folder's project is a usage error. Mesa writes a record with `adopted: true`, its agent session id, `name` when given, and `cwd` when the folder is not the project's own, then reopens the conversation in a Mesa window in that folder (`claude --resume <id>`), as `mesa resume` does, since claude finds a conversation only from the folder it ran in; `--no-resume` writes the record only, and `mesa resume` opens it later. Every adoption says `end the session in its original terminal first: both hold the same transcript`, in the output and as `--json`'s `warning`, beside the record's own fields (as `mesa resume` prints them). An id that is not a lowercase UUID is a usage error; one Mesa already has is a usage error naming that session, or saying another profile has it. A resume keeps `adopted`, `name`, and `cwd`.
Not: imported, attached, foreign (a foreign session is one not yet adopted).

## Window

The tmux window one session runs in, on the profile's own tmux server (socket `mesa-<profile>`, ADR-0001). The tmux session holding it is named after the project; the window is named `<agent>-<Mesa session id>` (`claude-a1b2c3d4`). A window whose agent exited stays, dead, with its output. `mesa windows [project]` lists them, and the Doctor screen shows them. `mesa attach <session>` shows a session's window in this terminal. Each terminal gets its own view session (`_view-<id>`), grouped with the project's session: it has the same windows but its own current window. tmux drops the view when the terminal detaches, and the board and `mesa windows` never list views. Attaching to the project's session itself would switch every attached terminal to that window. `--app` opens it in the app the config key `terminal.app` names, through `open -a <app> <script>`. `--print` prints the attach argv instead, and the app's embedded terminal runs that argv. Without a terminal on stdin, and with neither flag, it is a usage error. `mesa resize <session> <cols> <rows>` sizes the window to a view now, then hands sizing back to tmux's `window-size latest`, so from then on the client used last (attached or typed in) sizes it (ADR-0001 amendment). Mesa's server sets its windows up for the app's embedded terminal, as Xirp does (SP-3): `mouse on` (the wheel scrolls tmux's history), `status off`, and `set-clipboard external` (a copy goes out as OSC 52). A drag's copy is also piped to `pbcopy`, so it reaches the pasteboard in any client, Terminal.app included. In the app, Option-drag selects in xterm itself.
Not: pane, tab. A tmux session is a project's group of windows, never a Mesa session.

## Session state

Where a session is right now, one of the agent's states, `working`, `waiting-permission`, `waiting-question`, `idle`, `done`, `failed`, or Mesa's own for a session whose agent never ran: `queued` (see Queued session) and `stopped` (cancelled while queued). On every look at the board, Faro classifies a session in an agent state (`classifySession`) and attaches a confidence and a source; one in Mesa's own state keeps it, at no attention, with no Decision. The rules come first, in ADR-0003's order:

- A stopped session keeps its state.
- A dead or vanished window is a process fact (0.85): `failed` with a signal or a nonzero status, else `done`.
- Next comes the latest hook event: 0.95 under a minute old or when the listing agrees, 0.8 when stale. A `SessionEnd` from `/clear` or `/resume` says nothing, since the agent goes on. A wait more than 2 s old yields to a listing that says the agent moved on.
- Then the agent listing (0.85).
- Then the tail, the pane's last 30 lines read with CCManager's Claude Code patterns (0.6). The tail is read only when no hook or listing speaks.

When the least sure answer is below `decisions.threshold`, the adapter (`claude -p`) is asked, and its state is the row's, with source `adapter`. The adapter's answer is saved with a `basis`, a hash of what it saw, and it is not asked again while that is unchanged. Foreign sessions use rules only. A new state is saved in the record, with the time it began: the hook event's time, else when the board first saw it. `waiting-permission` and `waiting-question` are the states that need a human.
Not: status, phase, mode.

## Context use

How much of its context window a session has used, as the record's `context: {used, window, at, source}`: `used` in percent of `window` tokens, as of its agent's reply at `at`, with `source: transcript` (docs/spikes/context-use.md, ADR-0003's #70 amendment). Mesa reads the Claude Code transcript of the session's agent session id from its end: the last main-chain assistant message's input, cache-creation, and cache-read tokens, as the status line counts them; it reads no message content. `window` is the model's native window, from its id: 1M for Opus 4.7 and later, Sonnet 5 and later, and Fable, 200k for other Claude models, held to 200k when `CLAUDE_CODE_DISABLE_1M_CONTEXT` or a third-party provider (`CLAUDE_CODE_USE_BEDROCK`, `_VERTEX`, `_FOUNDRY`) is set in the environment claude runs with or in Claude Code's settings `env`. The field is absent while there is no reading: no transcript, no reply yet, a compaction since the last reply, or a model whose window Mesa does not know. Each Stop hook (`mesa hook claude`) reads it, and `mesa show` reads it again; a reading taken at a Stop can trail by one request, and one taken at rest is exact to the status line's rounding. `mesa sessions` shows it as `ctx <n>%` (`ctx -` with none), and the Board as a bar, amber from 55% and red from 60%.
Not: context (alone, which the Composition root avoids), tokens, usage.

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

The Session Board: the app's first screen (BoardScreen) and the output of `mesa sessions` (id, project, agent, state, confidence as a percent, attention, context use as `ctx`, running time, last output; `--json` adds each row's `decision` with its probabilities). Every session across every project, highest attention first; the app shows `mesa sessions --tree`, children nested under their parent and collapsible. Each row shows:

- a state badge coloured per state, with its confidence (hover: which decisions backend decided);
- the attention score;
- its context use, as a bar (see Context use);
- a running time that ticks between looks;
- the last output line of its pane.

Foreign sessions are muted and tagged "not managed", with Adopt their only action (see Adopted session). A Mesa row lists the prompts it received, with their sender. Clicking a live session's id opens its terminal in the app, under the board, and several can be open at once. This embedded terminal is xterm.js over a pty running `mesa attach --print`'s argv. It shows the 256-colour palette. A tmux copy reaches the pasteboard, Cmd+V pastes, and Close ends only the tmux client. Actions: New session (a modal dialog with a registered project, an agent, an optional goal, and an optional branch), and per row:

- Send (inline, Enter or the button sends);
- Open terminal (`mesa attach --app`);
- Stop, or Cancel for a queued session (see Queued session);
- Resume, once the agent has exited: stopped, its window gone, or its pane dead;
- Hand off, which asks for the note (see Handoff);
- Rename and Remove, in the row menu.

Each action's confirmation shows in a toast that goes by itself after a few seconds; a recorded action's warning (a receipt not written, skills not synced) shows with its confirmation as an alert, which stays until dismissed.

The app looks again every 2 s and at once after every action, one look at a time: a look asked for during one runs right after it. A failure shows as an alert toast, once however often it comes (ADR-0009 amendment). Another screen hides the Board instead of closing it (the owner's choice, #133): its embedded terminals, Show older, and collapsed rows are as they were on the way back, and it keeps looking meanwhile. None of it outlives the app.
Not: dashboard, overview, list.

## Skill

A folder with a `SKILL.md` that either agent can load; its frontmatter names it (`name`, the folder's name) and says when to use it (`description`). Repo skills live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex). Skills Mesa ships live in the repo's `skills/`, the library: `mesa`, which teaches an agent to drive Mesa (its workflows, the window variables, and `mesa help --agent` for the rest), `mesa-handoff` (see Handoff), and `session-summary`; a skill is enabled for a project when the profile's `skills` list (`[mesa, mesa-handoff]` in a new profile), or the project's `mesa.yaml` `skills` extras, name it. `mesa skills list [project]` prints `[{name, source, enabled, description}]`: the library's skills (`source: mesa`), and with a project its own too (`source: repo`). `mesa skills sync <project>` links each enabled skill into the project's `.claude/skills/<name>` and `.agents/skills/<name>` (a symlink into the library), removes the links Mesa made for skills no longer enabled, and never touches an entry it did not make: an entry of the project's own where a Mesa skill would go is a conflict, left alone; `--json` prints the diff (`added`, `removed`, `kept`, `conflicts`, `unknown` enabled names). A link is Mesa's when it resolves inside the library, and a skill folder that links to the other (`.claude/skills` to `.agents/skills`) is one place. Mesa's links are this machine's, so sync lists them in the repository's own exclude file (`.git/info/exclude`, shared by its worktrees): git never shows them, and a worktree with only Mesa's links in it is clean. Every start of a session (`mesa open`, `mesa resume`, `mesa adopt`, a handoff's successor, a queued start) syncs into the folder the agent runs in (the project's, its worktree, or an adopted session's own) before the window opens; a sync that fails is a warning, and the session opens anyway. The Projects screen lists the library's skills with what the profile enables, and its Sync skills runs the sync.
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

`createMesa(profile, deps)` in `packages/core/src/mesa.ts`: composes every Mesa service for one profile, each domain's built by its own service factory over one shared context (`createContext`, ADR-0008 amendment), from `MesaDeps` (home, cwd, clock, id source, UUID source (the agent session ids Mesa hands to claude), `self` (the argv that runs this mesa, for the hooks and for tmux), sleep, environment, process runner, Obsidian paths, the invocation's argv for receipts, and `skillsDir`, the skill library). The CLI entrypoint (`packages/cli/src/mesa.ts`) builds the real deps; tests build them with `testDeps`. The app never builds them: it reaches Mesa through the bridge, and its entrypoint `main.tsx` only picks the real bridge and platform (dialogs, terminals, the pasteboard). ADR-0008.
Not: container, context, app.

## Seam

A place where Mesa's behaviour can change without editing the code there: the process runner, the clock, the id source, the UUID source, the home directory, the environment, the sleep, the app's bridge and its platform (dialogs, terminals, the pasteboard). Each seam has a real implementation and a test one (`@mesa/core/testing`, `renderWithMesa`). Say implementation, not adapter: the adapter is a decisions backend.
Not: boundary, interface (the interface is what a caller must know; the seam is where it lives).

## Bridge

The app's seam to the mesa CLI: a function from an argv to the envelope mesa printed. The real one calls the Rust `run_mesa` command; tests pass a fake. The app's client is built over it.
Not: IPC, API, backend.
