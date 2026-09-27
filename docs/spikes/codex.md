# Spike: Codex CLI signals for a second agent

Issue: #43. Date: 2026-09-26. macOS (Darwin 25.6.0), tmux 3.7c, `codex-cli 0.154.0` from the standalone installer (`~/.local/bin/codex`, a symlink into `$CODEX_HOME/packages/standalone/`). The model was the account default, `gpt-6-astra`, with `model_reasoning_effort = "low"`. #158 builds on it, and its live checks are under "Checked in #158" at the end.

Question: what does Codex give Mesa in place of each thing Mesa reads from Claude Code (`packages/core/src/agents/claude/`: hook payloads for state, `claude agents --json` for the listing, pane text for the tail, transcripts for adoption and context use, and the start, resume, quit, and headless commands)?

Method: a temp `CODEX_HOME` holding a copy of the owner's `auth.json` and a `config.toml` written for the spike (the real `~/.codex/config.toml` was never written), a throwaway tmux server started under `env -i` (`tmux -u -L p3-codex-spike -f /dev/null`, `remain-on-exit on`, `focus-events on`, `-x 200 -y 50`, with `MESA_SESSION_ID` and `MESA_PROFILE` on the window), a temp git repo with invented files, and a Python hook that appended each payload with its environment to a capture file. Nine real prompts; seven more went to an invalid model and were rejected with HTTP 400 before any turn, at no model cost. The raw captures stayed with the spike; the pane captures Mesa's screen reader is tested on are in `packages/core/src/agents/codex/fixtures/panes/` (trimmed, paths invented), and a rollout's shape is in `packages/core/src/agents/codex/fixtures/rollouts/tui.jsonl`. In the excerpts below, paths are `$CODEX_HOME` and `<proj>`, and Codex's curly apostrophe is shown as `'`; its other glyphs (`›`, `•`, `·`, `⚠`, `✗`, `■`) are kept, since the tail patterns match them.

## 1. Hooks

### Format and events

`[[hooks.<Event>]]` in config.toml, PascalCase event names, then `[[hooks.<Event>.hooks]]` with `type = "command"`, `command`, and optional `timeout` (seconds), `async`, `statusMessage`, and a group-level `matcher`, as in Claude Code's JSON. `codex features list` shows `hooks  stable  true`. The hook review screen lists exactly 12 events: PreToolUse, PermissionRequest, PostToolUse, PreCompact, PostCompact, SessionStart, SessionEnd, UserPromptSubmit, SubagentStart, SubagentStop, Stop, and Interrupt. There is no `Notification` event.

A second install location also works: `$CODEX_HOME/hooks.json` in Claude Code's own JSON shape (`{"hooks": {"SessionStart": [{"hooks": [{"type": "command", "command": "..."}]}]}}`). It fired next to the config.toml hooks in an exec run with `--dangerously-bypass-hook-trust`. Its trust flow was not exercised.

`SessionEnd` and `Interrupt` timeouts above 3 s are clamped, and Codex then prints `⚠ clamping SessionEnd hook timeout to 3s in <config>` on every TUI start and as an `item.type: "error"` line in every `codex exec --json` run. A hook with no `timeout` produced no warning.

### The trust step

Two gates came before any hook ran, on the first launch in a new folder:

1. Folder trust (`fixtures/panes/folder-trust.txt`): `Do you trust the contents of this directory? ... Trusting the directory allows project-local config, hooks, and exec policies to load.` with `1. Yes, continue` preselected. Enter wrote `[projects."<proj>"] trust_level = "trusted"` into config.toml. No hook fired.
2. Hook review (`fixtures/panes/hooks-review.txt`, and the list behind it, `hooks-list.txt`):

```
  Hooks need review
  12 hooks are new or changed.
  Hooks can run outside the sandbox after you trust them.

› 1. Review hooks
  2. Trust all and continue
  3. Continue without trusting (hooks won't run)
```

In the review list, `t` trusts all. Codex then wrote one entry per handler into the user config.toml:

```toml
[hooks.state."$CODEX_HOME/config.toml:session_start:0:0"]
trusted_hash = "sha256:156577bb23c7772bab588f0d047dfd2000081f8b0474e096e39da985d91d58dc"
```

The key is `<file that defines the hook>:<snake_case event>:<group index>:<handler index>`, the same shape Codex uses for plugin hooks (`"<plugin>:hooks/hooks.json:stop:0:0"`) and project hooks (`"<repo>/.codex/hooks.json:stop:0:0"`). Per the source (`codex-rs/hooks/src/engine/discovery.rs`), the hash is `sha256:` over canonical JSON of `{event_name, group: {matcher, hooks: [normalized handler]}}`, and a stored hash that no longer matches marks the hook `Modified`, which needs review again. Six guesses at the normalized form did not reproduce the hash offline.

In `codex exec`, an untrusted hook was skipped with no warning at all; with `--dangerously-bypass-hook-trust` it ran, and the stream carried an `item.type: "error"` line saying so. After the one trust step, resumed and new sessions ran every hook without asking again.

### Payloads

Every payload carries `session_id`, `transcript_path` (the rollout file), `cwd`, and `hook_event_name`; all but SessionEnd carry `model` and `permission_mode`; turn events carry `turn_id`. Shapes, from the interactive run:

```json
{"session_id":"01a0e143-56e1-74e2-bd35-82bf0b47a6ce","transcript_path":"$CODEX_HOME/sessions/2026/09/26/rollout-2026-09-26T22-08-01-01a0e143-56e1-74e2-bd35-82bf0b47a6ce.jsonl","cwd":"<proj>","hook_event_name":"SessionStart","model":"gpt-6-astra","permission_mode":"default","source":"startup"}
{"session_id":"01a0e143-...","turn_id":"01a0e144-158c-73b0-ba73-b8320faa62d1","transcript_path":"...","cwd":"...","hook_event_name":"UserPromptSubmit","model":"gpt-6-astra","permission_mode":"default","prompt":"say hi"}
{"session_id":"01a0e143-...","turn_id":"01a0e144-a1e6-...","transcript_path":"...","cwd":"...","hook_event_name":"PreToolUse","model":"gpt-6-astra","permission_mode":"default","tool_name":"Bash","tool_input":{"command":"touch spike.txt"},"tool_use_id":"exec-4f5d313c-d8c9-4e7b-898a-65aa991cc674"}
{"session_id":"01a0e143-...","turn_id":"01a0e144-a1e6-...","transcript_path":"...","cwd":"...","hook_event_name":"PermissionRequest","model":"gpt-6-astra","permission_mode":"default","tool_name":"Bash","tool_input":{"command":"touch spike.txt","description":"May I run touch spike.txt in the current directory? The filesystem sandbox is read-only."}}
{"session_id":"01a0e143-...","turn_id":"01a0e144-a1e6-...","transcript_path":"...","cwd":"...","hook_event_name":"PostToolUse","model":"gpt-6-astra","permission_mode":"default","tool_name":"Bash","tool_input":{"command":"touch spike.txt"},"tool_response":"","tool_use_id":"exec-4f5d313c-d8c9-4e7b-898a-65aa991cc674"}
{"session_id":"01a0e143-...","turn_id":"01a0e144-158c-...","transcript_path":"...","cwd":"...","hook_event_name":"Stop","model":"gpt-6-astra","permission_mode":"default","stop_hook_active":false,"last_assistant_message":"Hi!"}
{"session_id":"01a0e143-...","turn_id":"01a0e145-2bf5-7331-9f26-8d100d6b5147","transcript_path":"...","cwd":"...","hook_event_name":"Interrupt","model":"gpt-6-astra","permission_mode":"default"}
{"session_id":"01a0e143-...","transcript_path":"...","cwd":"...","hook_event_name":"SessionEnd","reason":"other"}
```

- `SessionStart.source` was `startup` for a new session and `resume` after `codex resume`. `SessionEnd.reason` was `other` in all 25 SessionEnd events (TUI `/exit`, Ctrl-C, exec end, daemon unload).
- `tool_name` is `Bash`, as in Claude Code. `tool_response` is the command output as a string.
- `permission_mode` was `default` in the TUI (on-request) and `bypassPermissions` in `codex exec -c approval_policy=never`.
- PreCompact, PostCompact, SubagentStart, and SubagentStop did not fire (not exercised).

Hook environment, embedded TUI: `MESA_SESSION_ID`, `MESA_PROFILE`, `TMUX`, `TMUX_PANE`, and `CODEX_HOME` all present; the hook's parent pid was the pane pid (the `codex` process); its cwd was the project folder. There is no Codex variable carrying the session id (Claude has `CLAUDE_CODE_SESSION_ID`).

### Timeline, interactive run (embedded app-server)

`t` is seconds after the Enter that submitted each prompt.

| Step | t (s) | Hook events | Notify |
| --- | --- | --- | --- |
| launch, folder trust, hook review | | none | none |
| idle at the prompt | | none (SessionStart has not fired) | |
| "say hi" | 0.40 | SessionStart (`startup`), then UserPromptSubmit at 0.43 | |
| reply "Hi!" | 1.92 | Stop | 1.95 turn-complete; 2.40 a second one for Codex's title request |
| "Run exactly this shell command in the current directory: touch spike.txt" | 0.28 | UserPromptSubmit | |
| approval dialog | 5.01 | PreToolUse (`Bash`), PermissionRequest 0.14 s later | |
| still waiting, 8 s more | | none | none |
| approved (Enter on `1. Yes, proceed`) | +0.24 after Enter | PostToolUse, then Stop 1.46 s later | turn-complete |
| touch spike2.txt, dialog shown, Esc | about 0.1 after Esc | PreToolUse, PermissionRequest, then Interrupt | none |
| `/exit` | +0.05 after Enter | SessionEnd (`other`); pane dead after 0.36 s, status 0 | |

A denial fires `Interrupt`, where Claude Code fires nothing. No hook marks a wait that goes on (Codex has no `permission_prompt` or `idle_prompt` Notification).

### Legacy notify

`notify = [<program>, <args>]` got one JSON argument; stdin was not a tty; the env held the same `MESA_*` and `TMUX_PANE` values. Payload: `{"type":"agent-turn-complete","thread-id":"01a0e143-...","turn-id":"01a0e144-...","cwd":"<proj>","client":"codex-tui","input-messages":["say hi"],"last-assistant-message":"Hi!"}`. It fired on each completed turn, in the TUI (`client: "codex-tui"`) and in exec (`client: "codex_exec"`), never on an approval request or an interrupt. `input-messages` is every user message of the thread so far. It also fired for Codex's own title-generation request, under another `thread-id`; no hook fired for those.

## 2. Interactive codex in tmux

`pane_current_command` is `codex` (Claude's is its version string). Full captures in `packages/core/src/agents/codex/fixtures/panes/`.

Idle at the prompt (`idle.txt`):

```
› Ask Codex to do anything

  gpt-6-astra low · <proj>
```

Working (`working.txt`); the composer placeholder stays on screen while working:

```
• Working (0s • esc to interrupt)


› Ask Codex to do anything

  gpt-6-astra low · <proj> · renaming... ⠹
```

Waiting on an approval (`waiting-approval.txt`), with `approval_policy = "on-request"` and `sandbox_mode = "read-only"`:

```
• Running touch lantern.txt


  Would you like to run the following command?

  Environment: local

  Reason: May I run touch lantern.txt in the current directory? The filesystem sandbox is read-only.

  $ touch lantern.txt

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for commands that start with `touch lantern.txt` (p)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
```

After a denial (`after-deny.txt`): `✗ You canceled the request to run touch lantern2.txt` and `■ Conversation interrupted - tell the model what to do differently.`, then the idle prompt. After `/exit` (`after-exit.txt`): `Token usage: ...`, `To continue this session, run:`, `  codex resume <thread id>`, then tmux's `Pane is dead (status 0, ...)`.

`approval_policy = "untrusted"` no longer loads (`approval_policy = "untrusted" is no longer supported; remove this setting`). `on-request` with a `read-only` sandbox is what made a write ask.

Exiting politely: `/exit` opens the slash menu (`/exit  exit Codex`), and Enter exits: the pane was dead 0.36 s after Enter, status 0, SessionEnd fired. Ctrl-C once at an empty idle prompt also exits at once; with text in the composer, the first Ctrl-C clears it and the second exits.

Sending text: `send-keys -l '<text>'` followed at once by `send-keys Enter` lost the Enter 2 times out of 4: Codex's paste detection turned it into a newline in the composer (`typed.txt`). With a pause of 0.3 s or more between the two, 16 of 16 went through (five prompts and five `/exit` at 0.3 s, six `/exit` at 0.5 s).

Pane-level exits: `/exit` and Ctrl-C gave `pane_dead_status` 0; `kill -9` of a daemon-attached TUI gave `pane_dead_signal` `kill` and no SessionEnd from that process.

## 3. Session ids and rollout files

Codex has no `--session-id` flag: it picks the id, a time-ordered UUIDv7 (`01a0e143-56e1-74e2-bd35-82bf0b47a6ce` encodes 22:08:01, while the hook review screen was up, 50 s before the first prompt).

- The id is in the first `SessionStart` payload's `session_id`, which fires at the first prompt, not at launch. Started as `codex 'say hi'`, SessionStart came 3.3 s after launch.
- Before the first prompt nothing on disk names it: no rollout file, no row in `state_5.sqlite`. A TUI that exits without a prompt then writes a rollout holding only `session_meta`, and fires SessionEnd with no SessionStart before it.

Rollout path: `$CODEX_HOME/sessions/<local YYYY>/<MM>/<DD>/rollout-<local YYYY-MM-DDTHH-MM-SS>-<id>.jsonl`. The folder and the file name use local time while the timestamps inside are UTC. First line (the shape of `fixtures/rollouts/tui.jsonl`):

```json
{"timestamp":"2026-09-27T05:08:50.752Z","ordinal":0,"type":"session_meta","payload":{"session_id":"01a0e143-56e1-74e2-bd35-82bf0b47a6ce","id":"01a0e143-56e1-74e2-bd35-82bf0b47a6ce","timestamp":"2026-09-27T05:08:01.924Z","cwd":"<proj>","originator":"codex-tui","cli_version":"0.154.0","source":"cli","thread_source":"user","model_provider":"openai","base_instructions":{"text":"You are Codex, ...<trimmed>","provenance":{"type":"model","model":"gpt-6-astra"}},"history_mode":"paginated","context_window":{"window_id":"..."},"git":{"commit_hash":"...","branch":"master"}}}
```

`payload.timestamp` is when the thread started; the line's own `timestamp` is when it was written, at the first prompt. `originator`/`source` across the 11 rollouts: `codex-tui`/`cli` for embedded TUIs, `codex_exec`/`exec` for exec runs, and `codex-tui`/`vscode` for a TUI attached to the daemon. Title-generation requests leave no rollout.

Context use is in the rollout too: each `event_msg` of type `token_count` has `info.last_token_usage` and `info.model_context_window`. Turn boundaries are `task_started`, `task_complete` (with `last_agent_message`, `duration_ms`), and `turn_aborted` (`reason: "interrupted"` after the denial). This was not checked against the footer the way docs/spikes/context-use.md did for Claude.

Other indexes: `$CODEX_HOME/session_index.jsonl` holds `{"id","thread_name","updated_at"}` and no cwd; `state_5.sqlite` has a `threads` table with `id`, `cwd`, `source`, `originator`, `rollout_path`, and more, internal to Codex.

Newest rollout for a folder: the file names sort by start time, so walk them newest first and read only line 1, matching `payload.cwd`. Filter on `originator`/`source` too if exec runs and prompt-less exits must not count. Whether `cwd` is the realpath of a symlinked folder was not tested.

## 4. `codex resume <id>`

`codex resume <id>` in the recorded folder reopened the conversation: the old turns were on screen, no trust prompt or hook review came back, and a recall prompt got the right file names. The same rollout file grew; no new file. SessionStart came with the same `session_id` and `source: "resume"`, again only at the first prompt.

From another folder, resume first asked to trust that folder, then showed a picker (`fixtures/panes/resume-folder.txt`):

```
Choose working directory to resume this session

  Session = latest cwd recorded in the resumed session
  Current = your current working directory

› 1. Use session directory (<proj>)
  2. Use current directory (<elsewhere>)
  3. Always use session directory
  4. Always use current directory
```

`codex resume <id> -C <proj>` from the same other folder went straight to the prompt with no picker.

An embedded TUI's exit text is `To continue this session, run: codex resume <id>`; a daemon-attached one prints `Disconnected from this task. Any running work continues.` with `Reconnect: codex resume <id>`.

## 5. `codex exec --json`

`codex exec --json -C <proj> -c approval_policy=never -c sandbox_mode=workspace-write "say hi" < /dev/null`, exit code 0, 6.8 s:

```json
{"type":"thread.started","thread_id":"01a0e14b-160d-7223-b97f-3bfba273a138"}
{"type":"item.completed","item":{"id":"item_0","type":"error","message":"clamping SessionEnd hook timeout to 3s in $CODEX_HOME/config.toml"}}
{"type":"item.completed","item":{"id":"item_1","type":"error","message":"clamping Interrupt hook timeout to 3s in $CODEX_HOME/config.toml"}}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Hi!"}}
{"type":"turn.completed","usage":{"input_tokens":18630,"cached_input_tokens":12160,"cache_write_input_tokens":0,"output_tokens":6,"reasoning_output_tokens":0}}
```

- `thread_id` equals the hook `session_id` and the rollout file's id.
- Config warnings arrive as `item.completed` items of `type: "error"` before the turn; the run still succeeds. A parser must not read an `error` item as a failure.
- Usage has token counts only. No cost field appears anywhere.
- stderr always had `Reading additional input from stdin...`, even with `< /dev/null`.
- Hooks fired inside the exec process: SessionStart (`startup`, `permission_mode: "bypassPermissions"`), UserPromptSubmit, Stop, SessionEnd. Notify fired with `client: "codex_exec"`.

Failures:

| Case | Exit | stdout | stderr |
| --- | --- | --- | --- |
| `-C <no such folder>` | 1 | empty | `Error: No such file or directory (os error 2)` |
| `-C` a folder that is not a git repo | 1 | empty | `Not inside a trusted directory and --skip-git-repo-check was not specified.` |
| `-m <no such model>` | 1 | `thread.started`, warning items, `turn.started`, then an `error` line and a `turn.failed` line with the HTTP 400 body | stdin note only |

A failed turn fired SessionStart, UserPromptSubmit, and SessionEnd, with no Stop in between.

## 6. `codex exec --output-schema`

With `--output-schema <file> -o <file>` and the schema `{"type":"object","properties":{"greeting":{"type":"string"}},"required":["greeting"],"additionalProperties":false}`, exit code 0, 4.7 s, the final `agent_message` item's `text` was `{"greeting":"Hi!"}`, the whole of the `-o` file. There is no separate structured field like Claude's `structured_output`. The schema must be strict: without `additionalProperties: false`, exit code 1 and a `turn.failed` with `invalid_json_schema` ("'additionalProperties' is required to be supplied and to be false").

## 7. `codex agents` and the app-server daemon

`codex agents` exists but is a TUI ("Agent command center"); `codex agents --help` has no `--json`.

- It needs the standalone installer layout inside `CODEX_HOME`: with the temp home alone it exited 1 (`managed standalone Codex install not found at $CODEX_HOME/packages/standalone/current/codex`).
- It then started a daemon, `.../packages/standalone/current/bin/codex app-server --listen unix://`, with its socket at `$CODEX_HOME/app-server-control/app-server-control.sock` and pid file `$CODEX_HOME/app-server-daemon/app-server.pid`. The daemon outlived the `codex agents` TUI; `codex app-server daemon stop` stopped it.

A session started before any daemon showed in `codex agents` only from the state database, as `✓ Say hi  Finished`, while it worked and while it waited on an approval. It does not see a plain-terminal session's live state. Once the daemon ran, every plain `codex` or `codex resume <id>` attached to it (footer `· ← for agents`), and for those sessions `codex agents` was live: Working, then Needs input, then Ready, then Finished once the daemon unloaded the thread.

What changes for a daemon-attached session:

- Hooks run in the daemon process, with the daemon's environment: `TMUX_PANE` was the `codex agents` pane for turns typed in other panes. The daemon README says the same: "Shared clients use the environment inherited when the daemon started ... per-client environment isolation is not provided."
- `/exit` or a SIGKILL of the TUI only disconnects; the thread stays loaded in the daemon. SessionEnd came when the daemon unloaded the thread, 60 s after the last client left in the clean case.
- A `-c` override on the command line kept the TUI embedded even with the daemon running: `codex -c model_reasoning_effort=low` showed no `← for agents` footer and its `/exit` fired SessionEnd at once, while plain `codex` in the next window attached. The Codex source (`tui/src/session_queue_commands.rs`) reuses the daemon only when "config is replayable", and its error for a queue through an embedded server says "remove configuration overrides or use --remote"; this is observed behaviour, not a documented switch.

A JSON view of the same state exists on the daemon socket, which speaks JSON-RPC over a websocket: `thread/loaded/list` and `thread/list {"limit":5,"cwd":...}` returned the thread with `status: {"type": "notLoaded"}`, `cwd`, `name`, and `source`. The protocol schema gives `ThreadStatus` as `notLoaded`, `idle`, `systemError`, or `active` with `activeFlags` from `waitingOnApproval` and `waitingOnUserInput`, plus a `thread/status/changed` notification. An `active` status was not captured over JSON.

## Mapping to session states

Confidence tiers as in ADR-0003. "Embedded" means a TUI with no daemon attached.

| Signal | Condition | State | Confidence |
| --- | --- | --- | --- |
| SessionStart | `source` `startup` or `resume` | `idle` (a UserPromptSubmit follows within 0.1 s) | 0.95 |
| UserPromptSubmit | any | `working` | 0.95 |
| PreToolUse | any tool (fires for every command, not only waits) | no change | none |
| PermissionRequest | `tool_name` `Bash` | `waiting-permission` | 0.95 |
| PostToolUse | after an approval | `working` | 0.95 |
| Interrupt | a denial (Esc on the dialog) | `idle` | 0.95 |
| Stop | turn end | `idle` | 0.95 |
| SessionEnd | embedded TUI, any `reason` (`other` always) | `done` | 0.95 |
| SessionEnd | daemon-hosted thread | `done`, but only up to 60 s after the window already exited | 0.95, late |
| notify `agent-turn-complete` | `thread-id` equal to the session's id | `idle` | 0.95 (legacy; hooks cover it) |
| UserPromptSubmit then SessionEnd, no Stop | exec turn failed | `failed` | unverified for the TUI |
| `codex agents` Working / Needs input / Ready / Finished | daemon-hosted threads only, TUI text | `working` / `waiting-permission` / `idle` / `done` | not machine-readable |
| tmux `pane_dead` with status 0 / a signal | as for Claude | `done` / `failed` | 0.85 |
| tail `• Working (` or `esc to interrupt` | check first; the idle placeholder stays on screen while working | `working` | 0.6 |
| tail `Would you like to run the following command?` or `Press enter to confirm or esc to cancel` | | `waiting-permission` | 0.6 |
| tail `› Ask Codex to do anything` with no working marker | | `idle` | 0.6 |
| tail `Do you trust the contents of this directory?`, `Hooks need review`, `Choose working directory to resume this session` | startup gates, before any hook | a person is needed (`waiting-question` is the nearest state) | 0.6 |

`waiting-question` from a hook has no Codex equivalent here: no question tool was exercised (Codex has a `request_user_input` tool behind an under-development feature, and `ThreadActiveFlag.waitingOnUserInput` exists on the daemon).

## What #43 should do

1. **Start.** `codex` has no session-id flag, so the record cannot hold the agent session id before the window opens. Start with the goal as the first prompt (`codex '<goal>'`, as for claude) so SessionStart brings the id within a few seconds; without a goal the id arrives only with the user's first prompt. Mesa takes the id from the first SessionStart that carries this window's `MESA_SESSION_ID`, and the agent entry gets no `start(sessionId)` argument for Codex.
2. **Keep Codex embedded.** Put one `-c` override on every Mesa `codex` command line (start and resume), which kept the TUI off a running daemon. Only then do the window's `MESA_SESSION_ID` and `TMUX_PANE` reach the hooks, `/exit` end the session, and SessionEnd fire at once. This rests on undocumented 0.154.0 behaviour, so `mesa doctor` should warn when `$CODEX_HOME/app-server-control/app-server-control.sock` exists, and the owner should decide it in an ADR-0003 amendment. Independently, `mesa hook codex` should look sessions up by the payload's `session_id` once the record knows it, and use `MESA_SESSION_ID` only to claim a new id.
3. **Hooks install.** Write hooks for SessionStart, UserPromptSubmit, PermissionRequest, PostToolUse, Interrupt, Stop, and SessionEnd, with the same guard-and-tail command as claude's and no `timeout` (a value above 3 s on SessionEnd or Interrupt prints a warning on every start). `$CODEX_HOME/hooks.json` in Claude's JSON shape also works and would spare Mesa a TOML writer; its trust key would be the hooks.json path. Drop PreToolUse (it fires for every tool) and Notification (no such event). Keep notify out: hooks cover turn end, and notify also fires for title-generation threads.
4. **Trust.** New or changed hooks do not run until the user trusts them in the TUI's "Hooks need review" screen; `codex exec` skips them silently. `mesa hooks install` should say that the next Codex start asks for this, and `mesa hooks status` should report each event as trusted only when `[hooks.state."<file>:<snake_event>:0:0"]` has a `trusted_hash`. It should not pass `--dangerously-bypass-hook-trust`, which also runs every other untrusted hook. The command line must stay byte-stable, since any change resets trust.
5. **State rules.** Add a Codex `hookState`: the table above. Interrupt is Codex's denial signal, so the listing-override rule Claude needed for denials is not needed here. SessionEnd's `reason` carries nothing; do not branch on it as claude's `clear`/`resume` does. A SessionEnd with no SessionStart (a window closed before any prompt) is still `done`.
6. **Listing.** Drop `codex agents` as ADR-0003's second signal: it has no JSON, needs the standalone installer layout in `CODEX_HOME` (a Homebrew install would not have it), starts a daemon, and sees live state only for daemon-hosted sessions, which item 2 avoids. The daemon's `thread/list` and `thread/loaded/list` are a possible later source; leave them to a follow-up.
7. **Screen.** A Codex screen reader from the tail patterns above, with the working marker checked before the idle placeholder, and the three startup gates read as "needs a person". Last output line: the last `• ` line above the composer (`• Hi!`, `• Ran touch spike.txt successfully.`).
8. **Send and quit.** `send` must wait about 0.3 s between the text and Enter for Codex. `quit` is `/exit` with the same pause; Ctrl-C once also exits from an empty prompt.
9. **Resume.** `codex resume <id> -C <recorded cwd>`, run in that folder. Without `-C`, a resume from any other folder stops on a directory picker, and a folder never trusted stops on the trust prompt first.
10. **Adoption and context.** `transcripts.cwdOf`: the rollout's first line, `session_meta.payload.cwd`, found by id in the file name under `$CODEX_HOME/sessions/<local date>/`. Context use: the last `token_count` event's `info.last_token_usage` over `info.model_context_window`, to be measured against the footer before it ships.
11. **Headless (ADR-0004 adapter).** `codex exec --json -C <dir> -c approval_policy=never -c sandbox_mode=read-only --output-schema <file> -o <file> '<prompt>' < /dev/null`. Read `thread.started.thread_id`, the last `agent_message` text (JSON under a schema), `turn.completed.usage`, and `turn.failed`/`error` lines, skipping `item.type: "error"` warnings. Receipts get tokens, not a cost. Schemas must be strict (`additionalProperties: false`, every property required); Faro's schema builder must emit that form for Codex.
12. **Test configs.** `approval_policy = "untrusted"` is gone; fixtures and docs that force approvals use `on-request` with `sandbox_mode = "read-only"`.

The owner's decisions after the spike (#43's comments) split this into #158 (interactive sessions: items 1, 2, 6 to 9), #159 (hooks: items 3 to 5), and #160 (headless: item 11). Until #159's hooks, #158 reads the thread id from rollouts rather than SessionStart: the newest interactive rollout whose `session_meta.payload.cwd` is the session's folder and that started after its window opened.

## Not captured

- A SIGKILL of an embedded TUI (only a daemon-attached TUI was killed). Expected like Claude (no SessionEnd), unverified.
- A failed turn in the interactive TUI, and whether any hook marks it.
- A question wait (`request_user_input`) and its hook, if any.
- PreCompact, PostCompact, SubagentStart, SubagentStop payloads.
- Whether an unknown event key such as `Notification` is ignored or rejected. The hooks.json trust flow was checked in #159 below.
- The `trusted_hash` recipe, reproduced offline.
- `item.started` / `item.updated` exec lines, and exec items for a command or a file change.
- An `active` thread status over the daemon's JSON-RPC.
- Whether `cwd` in hooks and rollouts is the realpath of a symlinked folder.
- `codex exec resume`.

## Checked in #158

Run on 2026-09-26 with the same `codex-cli 0.154.0`, a temp `CODEX_HOME` holding a copy of `auth.json` (deleted afterwards), a throwaway Mesa profile under a temp HOME on its own tmux socket, and two real prompts.

- `mesa open lantern-cove --agent codex --goal "say hi"` ran `codex -c mesa.embedded=true -- 'say hi'` in window `codex-<id>`. The folder trust prompt came first, and the board read it as `waiting-question` from the tail. After Enter on it, the goal ran; the rollout landed in the local-date folder, and the next `mesa show <id> --json` had the thread id as `agentSessionId`, with the board reading `idle` and `• Hi!` as the last output.
- `mesa send` with the 0.3 s pause submitted the prompt; the board read `working` while it ran, then `idle`.
- `mesa stop` quit with `/exit` (outcome `exited`, about 1 s); `mesa resume` ran `codex -c mesa.embedded=true resume <thread id> -C '<folder>'`, which reopened the conversation with its earlier turns on screen.
- `--` before the goal makes a word Codex knows as a subcommand a prompt: `codex -c mesa.embedded=true -c model="<no such model>" -- review` opened the TUI with `review` as its first prompt (rejected by the model check, at no cost), where `codex review` runs a review.
- With a daemon started by `codex app-server daemon start` (in a `CODEX_HOME` short enough for the socket path: a long one failed with `path must be shorter than SUN_LEN`), `codex -c mesa.embedded=true` showed no `← for agents` footer and its `/exit` closed the pane, while a plain `codex` beside it attached (`· ← for agents`). The unknown `mesa.embedded` key printed no warning. `mesa doctor` warned `codex daemon` while the socket was there.

## Checked in #159

Run on 2026-09-27 with the installed `codex-cli 0.157.1`. A throwaway HOME and CODEX_HOME held invented `lantern-cove`, one copied auth.json (mode 0600), a separate Mesa profile, and its own tmux socket. The real user hook/config files were never edited. The temp config set low reasoning effort, on-request approvals, and a read-only sandbox, with no hook trust entries.

- Built Mesa ran `hooks install` twice. The second run changed no bytes in hooks.json; there was exactly one Mesa handler for each of the seven events, no timeout. Status showed all seven untrusted and explained the next-start review.
- `mesa open lantern-cove --agent codex --goal "Say only hi."` opened the embedded TUI at folder trust. Computer-use access to Terminal was denied, so the owner attached to this exact throwaway socket and completed folder/hook trust in the TUI, then reported done. No agent sent trust keystrokes, fabricated trust entries, or bypassed hook trust.
- The TUI answered `hi`. Its real hook log contained SessionStart, UserPromptSubmit, and Stop, in that order, under one thread id. SessionStart filled the Mesa record's agentSessionId. `mesa show --json` subsequently returned `idle`, source `hook`, confidence 0.8 because the Stop was more than a minute old (ADR-0003's aging rule).
- Codex wrote seven trusted_hash records whose source was the canonical hooks.json path. On macOS a `/tmp/...` CODEX_HOME becomes `/private/tmp/...` in those keys. This live finding added realpath-based lookup and a symlink-home regression test. After that fix, `hooks status --json` reported every event trusted, and Doctor's seven Codex rows were all `ok`.
- The deliberately minimal environment initially omitted LANG. tmux then replaced the tab separators in list-windows output with underscores, causing the existing window parser to report `Invalid time value`. Adding `LANG=en_US.UTF-8` to the inspection environment restored the ordinary tab output and public `show` flow. No unrelated tmux change is included here.
- Cleanup killed only the throwaway tmux server, deleted the auth copy and entire temp home/profile/project, and checked that the auth/root no longer existed and that listing the socket exited 1. The real default Mesa profile, vault, and Codex settings were untouched.

Limits: the owner performed the review interaction; its screen was not captured after computer-use was denied. The live run exercised SessionStart, UserPromptSubmit, and Stop, not all seven event deliveries. PermissionRequest, PostToolUse, Interrupt, prompt-less SessionEnd, and arbitrary SessionEnd reasons are covered by invented spike-shaped fixtures. The TUI showed two warnings whose details were not opened. Trust status reads Codex's recorded trusted_hash at each actual Mesa handler position; it does not reproduce or verify Codex's internal hash recipe, so a later external edit can require Codex review even while an older hash remains recorded.

## 11. Headless skills and restricted Faro adapter (#160, 2026-09-27)

Verified with installed `codex-cli 0.157.1`. Every live call used a temporary HOME and CODEX_HOME, a mode 0600 copy of the authorized auth file, invented data, and no hooks or hook-trust bypass. Exact temporary homes, auth copies, and profiles were deleted in `finally`; no real profile, vault, or Codex config was changed. The skill check used an invented git project. These probes did not use tmux; Mesa's window lifecycle is covered separately by the core/CLI tests and the delivery check.

### Skill and stdin discovery

The installed `codex exec --help` states that stdin is appended as a `<stdin>` block when a positional prompt is present. A local `.agents/skills/lantern-proof/SKILL.md` instructed Codex to return `LANTERN_SKILL_OK` and the stdin marker, with no tools. This command returned exit 0 and `LANTERN_SKILL_OK TIDE_STDIN_731`:

```sh
printf 'Input marker: TIDE_STDIN_731\n' | codex exec --json -C <invented-git-project> -c approval_policy=never -c sandbox_mode=workspace-write '$lantern-proof'
```

The recorded stream is `packages/core/src/agents/codex/fixtures/results/skill-stdin.jsonl` (thread id replaced with an invented one). It reported input 14851, cached input 12160, output 16, cache write 0, reasoning output 0. The result reader also replays section 5's successful stream, including nonfatal error items, and tests malformed, incomplete, top-level-error, failed-turn, and nonzero-exit cases. Startup stderr, including a bad `-C`, goes through the shared run owner. Codex supplies no duration, so Mesa measures elapsed wall time.

### Faro's authority

The installed CLI supports `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--strict-config`, and `--output-schema`. The [official config reference](https://developers.openai.com/codex/config-reference) defines named permission profiles, deny filesystem entries, and tool-network denial. The [official apply_patch handler](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/apply_patch.rs) passes the environment sandbox into patch verification; the [tool plan](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/spec_plan.rs) offers apply_patch whenever the model supports it and an environment exists (sources inspected 2026-09-27).

Mesa uses these strict config overrides, rather than the skill run's workspace-write sandbox:

```toml
approval_policy = "never"
default_permissions = "faro"
[permissions.faro.filesystem]
"/" = "deny"
[permissions.faro.network]
enabled = false
```

The exact argv is owned by `decisions/codex.ts` and recorded in `decisions/fixtures/adapter/codex-choice.json`. It disables shell, apps, plugins, hooks, memories, chronicle, host skill discovery, skill search, multi-agent, browser/computer use, image generation/viewing, goals, web search, project instruction loading, the native environment context, and plan updates. `include_environment_context=false` keeps Codex from adding the unredacted home/profile path beside the redacted Faro state. It ignores user config and exec rules, starts in a private scratch directory with only the schema, and does not persist conversation history. `--skip-git-repo-check` permits that empty non-project folder; it grants no hook or folder trust. The provider still reads its authentication and native administrative settings. No raw project or session files are offered to Faro.

A tiny native probe requested two apply_patch operations against invented data: update `<temporary>/private.txt` (containing `INVENTED_PRIVATE_LANTERN_042`) and add `<temporary>/empty/blocked.txt`. The update failed before reading its contents:

```text
apply_patch verification failed: Failed to read file to update <temporary>/private.txt:
fs sandbox helper failed with status exit status: 71:
sandbox-exec: execvp() of '<codex-binary>' failed: Operation not permitted
```

The add failed with `patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings`. The sentinel stayed unchanged and the added file did not exist. This is offered-but-denied apply_patch, not a claim that zero tools were offered. The deny-all profile intentionally prevents even the filesystem helper from executing. Unsupported flags/config fail closed through the existing rules fallback; `features.skip_host_skill_discovery` currently produces an under-development warning.

A real isolated `mesa config set decisions.adapter codex`, followed by `mesa decide --json` with state `{"status":"The lantern check passed."}` and a Choice over `passed`/`failed`, returned backend `adapter`, answer `passed`, probabilities 1/0, confidence 1, no cost, in 5161 ms after disabling native environment context. The strict schema and complete request/reply are recorded, with invented ids and temporary paths. An invented MCP entry in ignored user config did not start its marker process; the schema/scratch directory was absent after completion. Unit replays assert schema/argv, file modes, cleanup on success/failure/timeout, no cost, and rules fallback.

Limitations: this is the installed macOS CLI's native enforcement, not a cross-platform certification. Ephemeral mode prevents conversation history, not every provider diagnostic/cache write. Codex skill runs deliberately retain normal provider config/skills and workspace authority; only the Faro adapter uses the deny-all profile. The full session-summary and project-brief live acceptance checks are recorded by the delivery owner separately.

### Delivery qualification: real note flows

On 2026-09-27 the delivery owner used built Mesa at `45c9b80` with installed Codex 0.157.1 for three real runs, in a fresh temporary HOME/CODEX_HOME, invented git project and vault, a separate Mesa profile/tmux socket, and one authorized 0600 auth copy. No hooks were installed or trust bypassed. The source session was a stand-in emitting invented terminal output; Codex performed the actual synthesis.

- `mesa run session-summary --session <source> --agent codex` completed in 7582 ms, read the private redacted stdin, and wrote the linked wiki note. It preserved the three-blue-lamp result and pending copper battery, and correctly distinguished the log's reported test result from independently verified evidence. Captured provider rollouts contained the source facts and masked invented key, with the original invented secret absent. The note contained no terminal escapes or secret.
- `mesa run project-brief --project lantern-cove --agent codex` completed in 17808 ms. Its note had Purpose, Stack, How to run, Open threads, registered repo metadata, and an updated timestamp. Its text reflected the README, mesa.yaml and available git history.
- After changing the invented README and committing it, a rerun completed in 17195 ms. Generated sections changed to four amber lamps and a silver battery tracker; updated advanced to the next minute. A paired keep block containing the human's purple-lantern note survived byte-for-byte, exactly once.
- Each run produced a finished skill receipt with native thread id, measured duration, output and note paths, and token usage under outputs.usage; no cost was fabricated. The note/log/receipt links were checked through public CLI results and the invented vault files.

Cleanup killed only this test's tmux server and removed its exact socket, auth copy, home, profile, project and vault; absence was checked. These runs qualify the real Codex note flow. They do not qualify real Claude synthesis or its allowed-tools behavior, which remained blocked by the previously observed Claude account quota.
