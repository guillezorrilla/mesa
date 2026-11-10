# What Mesa should take from orca

Date: 2026-11-10. orca (`stablyai/orca`, MIT, Lovecast Inc.) read at commit `12e809c7` (2026-11-10), from its README, docs site, skills and source; nothing of it was run. Mesa at 0.3.12.

## Question

orca is an Electron app that runs many coding agents in parallel worktrees, like Mesa. Which of its features, and which of its ways of doing what Mesa already does, are worth bringing to Mesa, in what order? The owner named two to look at first: orchestrating agents, and a mobile app.

## Evidence from the owner's own use

Read from the default profile's 549 session records, their hook event logs, and 69 distinct agent transcripts, counting only; no content leaves the machine. Of 84 interactive sessions, 47 were started from another session.

- **Orchestration by hand.** Seven session families had three or more members; the largest had twelve sessions across three projects and traded 431 messages over twelve days. Agents ran `mesa send` from 514 shell calls and `mesa open` 69 times, but `--after` in only one transcript, so every sequence was chained by hand.
- **Waiting by polling.** 220 `sleep` calls (about 5.6 hours blocked) and 324 `until`/`while` loops across 49 transcripts, checking on other sessions or CI.
- **Results not coming back.** 22 of 39 sampled children never sent anything to their parent. The owner typed into children directly 438 times, against 321 prompts delivered by `mesa send`: most steering of workers was done by the person.
- **Workers stalled on a person.** About 16 `mesa send` calls were refused because the child was waiting on a permission or question prompt; the parent could only say a person must answer there.
- **Merging back.** 73 merge, cherry-pick or `gh pr merge` calls in 27 transcripts, 12 with conflicts, all handled in conversation.
- **Lost family links.** After two restarts, sessions resumed as new ids; 8 children now name a parent with no record, and others name the predecessor rather than the live successor.
- **Away from the desk.** 179 permission or question prompts; the median was answered in 18 seconds, but 3 waited over 4 hours (about 38 hours blocked in total). Of 276 turns that ended asking the owner something, 16 waited over an hour and 12 over 4 hours; in the 12 sessions with an hour-long wait, the median such wait was about 23 hours, the overnight gap. Long waits cluster at the end of the day.

The pattern: at the desk, Mesa is fast; orchestration is a pile of `send`, `sleep` and manual merges; and away from the desk, work stops until the next morning.

## orca's features, and whether Mesa has them

| orca feature | How orca does it | Mesa |
| --- | --- | --- |
| Parallel worktrees | A worktree or plain folder per task; `orca.yaml` setup scripts, `.worktreeinclude` copies ignored files | Has it: `--branch`, `--worktree`, `--with`; `worktrees.setup`, explicit ignored directories |
| Agents in a terminal or a chat UI | About 40 agent CLIs; structured chat over ACP or a transcript view of a terminal | Terminal only, three agents; Replies pane reads native responses |
| Agent state | Hooks POST to a loopback server; OSC 7501 status from the PTY stream as fallback | Has it: hook log, agent listing, pane tail (ADR-0003) |
| Terminals survive app restarts | `orcad` daemon owns the PTYs; restore brings back splits and scrollback | Has it: tmux server (ADR-0001) |
| Hibernation | Stops idle, finished, unwatched agent processes; resumes on return | No |
| Notifications and activity feed | OS banner, sound, card chip, Dock badge, feed of completions and questions | Has it: Inbox, native delivery, Visual alert, Unread |
| **Orchestration** | Coordinator skill, `worker-start`, a mailbox that wakes the coordinator, tasks with dependencies, questions and decision gates, a Crew panel | Parts: child sessions, `--after`, `send`, `handoff`; no results back, no wake, no crew view |
| Hand off with nothing back | `worktree create --no-parent --prompt` | Has it: `mesa open --no-parent --goal`, `mesa handoff` |
| Status line on a card | `worktree set --comment` by the agent | Partial: Workflow status label, set by a person |
| Automations | Scheduled prompts | Has it (ADR-0016) |
| Diff review back to the agent | Annotate changed lines, sent as one batch; AI line attribution in the gutter | Has review send and change send; no attribution |
| PR state and checks | GitHub, GitLab, Bitbucket, Azure, Gitea; failures sent to the agent | Has it for GitHub: PR events, PR reviews |
| Tickets | GitHub, Linear, Jira; start a workspace from an issue | Has it, plus ClickUp and Notion imports |
| Built-in browser | Chromium pane agents drive; design mode copies an element | Has browser selection and annotation send |
| Computer use, emulators | Native accessibility sidecars, iOS and Android emulators | No; out of Mesa's scope |
| Usage and accounts | Usage and reset timers for ten providers, warning at 80%, switch accounts | Partial: usage ledger with estimated cost; no limit windows or warnings |
| Session history | Browse and resume past sessions of many agents | Has it: discover, adopt, history search |
| **Mobile app** | Expo app; pair by QR; end-to-end encrypted socket over LAN or orca's relay; push through orca's APNs/FCM gateway | No |
| Remote server, SSH, per-workspace VMs | `orca serve` on another machine paired like a phone; SSH targets; VM recipes | No |

## The two the owner named

### Orchestration

**How orca does it.** It is a skill, not a button: the person asks their agent to split the work, and the `orchestration` skill (a stub that prints a version-matched guide from `orca skills get`) teaches the coordinator one recipe: `orca orchestration worker-start --spec "<task>" --worktree current|new-child --agent codex`, start every worker, then end its turn. Each worker's prompt starts with a preamble naming its coordinator and task, telling it to ask with `orchestration ask` and end its turn rather than use the agent's own question tool, and to finish exactly once with `send --type worker_done --body "<what I did, found, what's left>"`. Mail lands in a SQLite mailbox, and orca wakes the coordinator: a pointer prompt typed into its terminal once it is taking input, or a structured message for a chat agent. The skill forbids polling. Larger work becomes a Run with Tasks and dependencies (`task-create --deps`, `task-list --ready`), with decision gates the person resolves. A Crew panel lists workers and their states. Nothing merges by itself: workers share the coordinator's tree by default, or leave child worktrees for someone to merge.

**What Mesa lacks for the one flow.** Mesa already starts a worker in its own worktree with a goal and records it as a child, queues work with `--after`, and signs messages so a child can reply. What it does not do:

1. Bring a child's result back. A child that finishes, asks something, or stalls on a permission prompt tells no one unless its agent remembers to `mesa send`, and the parent finds out by polling.
2. Wake the parent. The parent has no event to wait on, so agents `sleep` and loop.
3. Tell a worker it is one. A child's goal is whatever the parent typed; nothing says its last reply is its report or how to ask its parent.
4. Show the crew. `mesa sessions --tree` lists the family, but no screen gathers a parent's workers, their latest reports and their branches.
5. Merge back. Bringing each worker's branch into the parent's, and handling conflicts, is manual.
6. Keep the family after a restart. A resumed session is a new id, and its children keep naming the old one.

**Design.** Reports, not a new orchestration subsystem. When a child's turn ends (Claude Code and Codex `Stop` hooks), when it waits on a person, or when it ends, Mesa records a report for its parent: who, what happened, and its latest reply (the text `mesa review responses` already reads). Delivery follows the PR event pattern: a parent that is idle gets the pending reports typed in at once, as one prompt signed from Mesa; a parent that is working gets them when its own turn ends, through its `Stop` hook (Claude Code continues the turn with the hook's reason, so nothing is typed into a busy pane). The child's goal gets a short worker brief, the mesa skill gets an Orchestrate workflow ("open workers, end your turn, Mesa brings their reports"), and the app gets a Crew panel on a parent. Merge and task graphs come after, if the reports prove out.

### Mobile

**How orca does it.** An Expo app for iOS and Android. Pairing is a QR or pasted code carrying the desktop's endpoint, a device token and its X25519 public key. The phone talks to the desktop's RPC server directly over LAN or Tailscale, or both sides dial out to orca's relay (`relay.onorca.dev`, a director that assigns a regional cell, which splices frames it cannot read: the channel is end-to-end encrypted with NaCl boxes). Push goes through orca's own Cloud Run gateway, which holds the APNs key and sends FCM; the desktop posts each push's title and body in plain text, so the gateway sees them. Relay and push need an orca account. The phone lists worktrees and states across every paired machine, reads scrollback, replies, answers permission and question cards, reviews changes, and starts workspaces.

**The path chosen: a native iOS app (owner, 2026-11-10).** Three paths were weighed: a home-screen web app with Web Push sent straight from the Mac (no push server, no App Store), a Telegram bot (no hosting, but bot chats are not end-to-end encrypted), and a native app as orca has. The owner chose the native app, for its notifications and feel. What it needs:

- **Apple Developer Program** membership for the app identifier, the APNs key, and TestFlight builds to the owner's phone. App Store release is not needed for the owner's own use.
- **A push sender holding the APNs key.** A key shipped inside Mesa is not secret, so the existing broker (`apps/broker`, ADR-0014) holds it as a Worker secret and sends to APNs. The Mac authenticates to it with the pairing, never an account. Each payload is encrypted with the pairing key and decrypted on the phone by a Notification Service Extension, so the broker relays ciphertext, unlike orca's gateway, which sees titles and bodies.
- **A relay for replies and reads.** A Durable Object on the same Worker holds one encrypted mailbox per pairing; the Mac and the phone both dial out, so no port opens on the Mac, and the key from the pairing QR encrypts both ways.
- **The Mac side** needs a process awake to read the mailbox: the app while open, or the profile scheduler's LaunchAgent (ADR-0016). Pushes go out from the hook that raises the notice. A Mac asleep sends and hears nothing; keeping work moving with the laptop shut is the remote-host feature, later.
- **An ADR amendment to ADR-0014**: the broker would carry encrypted session text and hold a push credential for the first time.

The app's stack, SwiftUI or Expo, is decided when the epic starts: SwiftUI needs no JavaScript toolchain on the phone and writes the service extension in the same language; Expo shares TypeScript with the rest of Mesa.

## How orca does what Mesa already does

Measured on the owner's Mac where noted; orca read, not run.

| Capability | orca | Mesa | Verdict |
| --- | --- | --- | --- |
| Running agents across app restarts | Its own daemon holds the PTYs through node-pty, checkpoints each screen every 5 s, exits after 15 idle minutes; after a reboot the layout comes back but each agent is restarted by hand | tmux, one server per profile (ADR-0001); the app resumes interrupted sessions after a reboot by itself | Keep Mesa's: smaller, and it brings the agents back |
| Watching agent state | Hook scripts are shell plus `curl` posting to a loopback server (0.5 s connect, 1.5 s cap); OSC 7501 status read from the terminal stream when hooks are silent for 2 min | Every hook runs `mesa hook`, about 0.13 s of synchronous Node, on every tool call; the app looks every 2 s, each look a CLI spawn (about 0.4 s) that runs `claude agents --json` and one `capture-pane` per window | Adapt: hooks that decide nothing run `async`; the app watches `sessions/events/` and looks on change, polling every 10 s as a fallback; the agent listing runs only when a hook is stale or waiting. OSC 7501 cannot pass through tmux |
| Worktree setup | Copies ignored files named in `.worktreeinclude` with APFS clones (`cp -c`), within a 2 GiB and 50,000 entry budget; fetches only the base's remote, reusing a fetch under 30 s old; setup runs in a visible terminal while the agent starts | Carries only directories, byte by byte; `git fetch --all --prune` before every new branch (up to 60 s); setup hidden and blocking (up to 120 s); setup scripts approved by hash, which orca lacks | Adapt: clone with `cp -c`, carry files too, within a budget; fetch the base alone, at most every 30 s; run setup in a sibling window |
| Terminal rendering | xterm 6.1 with WebGL, search, image and ligature add-ons | xterm 6.0, DOM renderer, tmux history | Adapt: the WebGL add-on (the embedded-terminal spike showed it loads in WKWebView), disposed on context loss |
| Notifications | A notice the moment an agent goes idle, skipped when its worktree is focused, bursts merged within 5 s; system idle time gates phone pushes | Inbox from the hook log; the app claims a delivery every 5 s, a finished turn waits 5 s; skipped per session by `seenAt`, which is finer | Keep Mesa's rules; deliver off the same events watcher. Borrow system idle time for phone push |
| Launch speed | The daemon is already up; the worktree is made behind a progress row | One CLI spawn and tmux; the slow parts are the fetch, the copy and the setup | Keep; the worktree changes are the speed-up |
| Idle agents | Hibernation (off by default): an agent finished, unseen and idle 30 min is stopped, and resumed with `--resume` when opened | Nothing stops them: 19 live `claude` processes held about 4.4 GB | Adapt: a look puts a finished, unseen session to sleep after a set time; opening it resumes it |
| Plan limits | Reads the Claude login's 5-hour and weekly windows, every 15 min while focused, and warns at 80% | Estimated cost per session; no plan limits | Adapt: read limit fields from what `mesa statusline` already receives, if Claude Code passes them; else orca's request, an undocumented endpoint |
| The app's calls into the CLI | One long-lived main process | A CLI spawn per call: the board every 2 s, notifications every 5 s, the vault view every 5 s | Adapt: a long-lived `mesa` child answering JSON over stdio, keeping the CLI the one interface |

Files worth reading before reimplementing (MIT): `src/main/ipc/worktree-apfs-clone.ts` and `src/main/ipc/worktree-include-copy-budget.ts`. The hook server and daemon are not worth copying.

## Ranking

By value to the owner alone. Sizes only split the work into half-day issues.

| # | Candidate | Value to the owner | Size | Risk |
| --- | --- | --- | --- | --- |
| 1 | **Orchestration: reports come back** (epic) | Removes the `sleep` and polling loops, the unreported children and most hand steering; the most-used multi-session flow | 7 issues, about 16 h | A report typed into a parent mid-thought; guarded by delivering only to an idle parent or through its own `Stop` hook. Codex's `Stop` hook continuation needs qualifying |
| 2 | **Phone: native iOS app, push and reply** (epic) | Turns the overnight gaps (12 waits over 4 hours, 38 hours blocked on prompts) into minutes | 6 issues, about 20 h, plus the owner's Apple setup | First hosted path for session text and a push credential on the broker (both encrypted end to end); ADR-0014 amendment; Mac must be awake |
| 3 | Event-driven board | The app stops spawning a CLI every 2 s and notices in under a second | 3 issues, about 7 h | Async hooks reorder events; order by `at` |
| 4 | Sleep idle agents | Gigabytes back with many sessions open | 2 issues, about 4 h | A sleeping session misses a `send`; send wakes it |
| 5 | Faster worktree start | Seconds to a minute off each `--branch` start; `.env` carried | 3 issues, about 6 h | Copy budget must stop a runaway list |
| 6 | Plan limits and warning | Wide parallel runs hit limits twice | 1 to 2 issues, about 3 h | Undocumented source |
| 7 | Remote host: keep running with the laptop shut | The rest of "keep work moving" | Epic, not sized | Large; after the phone |
| 8 | WebGL terminal | Smoother rendering with many tiles | 1 issue, about 1 h | Context loss in WKWebView |

The owner picked the event-driven board, sleeping idle agents and the faster worktree start to follow orchestration: epic #893 (#894 to #901).

Not taken: computer use and emulators, per-workspace VMs, a chat UI, AI line attribution, forty agent adapters.

### Orchestration epic, in build order

Filed as #885: #886, #887, then #888 (a busy parent gets reports through its own `Stop` hook), #889, #890, #891, #892.

1. **Reports come back** (M). A child's turn ending, waiting on a person, or ending records a report for its parent with its latest reply; `mesa reports [session] [--deliver] --json` lists and delivers them; an idle parent gets them at once, a busy one when its own turn ends; the app shows a parent's pending reports and runs delivery beside PR events.
2. **Worker brief and Orchestrate workflow** (S). A child an agent opens gets one paragraph in its goal: its parent, that its last reply is its report, to ask by ending its turn with a question, and not to poll; the mesa skill gets the Orchestrate recipe.
3. **Crew panel** (M). A parent's details list its workers: state, latest report, branch and diff size, with send and stop.
4. **Family survives resume** (S). A resumed successor takes its predecessor's children, and a child of a resumed parent reports to the successor.
5. **Merge a worker back** (M). `mesa merge <child>` merges a worker's branch into its parent's checkout, or stops cleanly and reports the conflicting files.
6. **Wait for sessions** (S). `mesa wait <ids...> [--timeout]` blocks until each is idle or over, for scripts and headless runs that cannot end a turn.

### Phone epic, in build order

Filed as #902; child issues are filed when it starts, once SwiftUI or Expo is chosen.

0. **Owner setup** (manual): Apple Developer Program, an app identifier, an APNs key set as a broker secret, TestFlight.
1. **Encrypted mailbox and pairing** (M). A Durable Object per pairing on the broker; Settings > Phone shows a QR; `mesa phone pair|status|unpair --json`; ADR-0014 amendment.
2. **iOS app that pairs** (M). Scans the QR, joins the mailbox, shows the paired Mac.
3. **Push a notice to the phone** (M). Input-required and finished notices sent through the broker to APNs, encrypted, decrypted by the service extension.
4. **Push only when away** (S). Skip a push while the Mac has had input in the last few minutes.
5. **Read and reply** (M). The sessions waiting on the owner, a session's state and latest reply, and a reply that becomes `mesa send` as the person, through the guardrail, with a receipt.
6. **Answer a prompt from the phone** (M). Permission and question prompts answered with the keys the agent's prompt takes; needs a qualification run per agent.

## Review AI output

| Step | orca | Mesa |
| --- | --- | --- |
| Where | Notes straight on the diff of a worktree, unstaged, staged or the whole branch | Replies > Changes, uncommitted work only; the Session diff, where committed branch work shows, takes no note |
| Anchor | A line, a dragged range, or a whole file; also passages of rendered Markdown | One whole hunk, picked from a list |
| Keeping notes | Saved as written, across restarts; a Notes shelf lists them | One note at a time, lost when the file changes in the view |
| Sending | All unsent notes, or one file's, as one prompt of `File:`, `Lines:`, `User comment:` blocks; to any agent in the worktree, or into its input without sending | One hunk per prompt, quoting the hunk, through the guardrail with a receipt and a staleness check orca lacks |
| Answer | In the terminal | Replies lists the agent's answers, and a passage of one can be reviewed in turn, which orca lacks |
| Re-review | Sent notes stay pinned; editing one makes it unsent | Nothing on the diff |

So Mesa keeps its sending path and gains line notes on the Session diff, kept as drafts and sent in one prompt: epic #903 (#904 to #907). orca's docs describe a Resolve state and AI line attribution that its code does not seem to have yet.

## More of orca for the Mac app

From a second pass, the owner picked these as well: epic #910 (#913 to #923), after #903.

- **Keep the Mac awake** while agents work (orca holds a power assertion: off, on, or only while an agent is working).
- **AI git actions**: draft a commit message or a PR title and body from editable recipes; hand a failed pre-commit hook, or a merge conflict, to an agent.
- **Worktree sizes and dev-server ports**: a size per worktree beside the safe cleanup Mesa has; the localhost URLs each session printed.
- **Richer session cards and a jump palette**: the last reply's first line, PR state and changed lines on each card; a progress line an agent sets on its own card; a switcher that ranks sessions waiting on the owner first and matches a PR number.

Seen and not taken for now: account hot-swap (Mesa's profiles cover part), a floating global terminal, saved shell commands per project, voice dictation, contextual tours, a status bar.

## License

orca is MIT, as is Mesa, so its code may be copied with its notice. Where a piece is copied, its attribution goes in the release's attributions (`packages/core/src/about`, `ATTRIBUTION_SOURCES`, which would need a source kind for copied code). The designs above reimplement orca's ideas on Mesa's own seams (tmux, hooks, the broker), so no code is copied so far.
