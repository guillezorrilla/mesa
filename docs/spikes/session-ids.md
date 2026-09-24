# Spike: capture and resume Claude session ids

Issue: #7. Date: 2026-09-24. macOS (Darwin 25.6.0), tmux 3.7c, Claude Code 2.1.281 at the first launch and 2.1.282 from the resume onward (the binary auto-updated during the spike; nothing below differed between the two).

Codex: the optional Codex items (`codex exec --json` event lines with `thread.started`, thread id capture, resume) are open and tracked in #43. v1 is Claude Code only.

Edits to captured output: the home directory is shown as `$HOME`, the username as `$USER`, and the per-user temp segment `/var/folders/<2 chars>/<hash>` as `/var/folders/XX/XXXXXXXX` (also in its escaped form `-var-folders-XX-XXXXXXXX`). In the headless `result` text the list of the account's MCP connector names is replaced with `<connector names redacted>`. Those are the only edits to the verbatim payloads; JSON is pretty-printed with `jq`. `claude agents --json` output is filtered to the spike session's row. Screen captures are trimmed to the relevant lines (banner and status line dropped).

## Setup

- Scratch project `$TMPDIR/mesa-spike.proj` holding a two-line invented `README.md`. The dot in the name is there to show how `.` is escaped.
- A temporary SessionStart hook loaded per session with `--settings`, confirmed in `claude --help`: `--settings <file-or-json>  Path to a settings JSON file or a JSON string to load additional settings from`. `~/.claude/settings.json` was not touched. The hook and settings are under "Temporary hook" below.
- A throwaway tmux server, `tmux -L mesa-spike -f /dev/null`, started under `env -i` with only `HOME USER LOGNAME PATH SHELL LANG TMPDIR TERM`. The spike ran from inside a Claude Code session whose environment carries `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION` and other `CLAUDE_*` variables, and a tmux server inherits the environment of the process that starts it. Headless runs used the same `env -i` wrapper. Behaviour with those variables left set was not tested.
- `--permission-mode manual` was passed because this machine's global `defaultMode` is `auto`; it does not affect ids.

## Temporary hook

`$SPIKE` is a temp directory (`SPIKE=$(mktemp -d)`). `$SPIKE/hook.py` appends one JSON line per invocation:

```python
#!/usr/bin/env python3
# Temporary Mesa spike hook: append one JSON line per invocation.
# argv[1] = event label from settings, argv[2] = capture file.
import json, os, sys, time
label, capture = sys.argv[1], sys.argv[2]
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    payload = {"_raw": raw}
env = os.environ
rec = {
    "ts": round(time.time(), 3),
    "label": label,
    "payload": payload,
    "env": {
        "MESA_SESSION_ID": env.get("MESA_SESSION_ID"),
        "MESA_PROFILE": env.get("MESA_PROFILE"),
        "CLAUDE_CODE_SESSION_ID": env.get("CLAUDE_CODE_SESSION_ID"),
        "CLAUDE_PROJECT_DIR": env.get("CLAUDE_PROJECT_DIR"),
        "TMUX_PANE": env.get("TMUX_PANE"),
        "TMUX_is_set": "TMUX" in env,
        "names": sorted(env.keys()),
    },
    "ppid": os.getppid(),
}
with open(capture, "a") as f:
    f.write(json.dumps(rec) + "\n")
sys.exit(0)
```

`$SPIKE/settings.json` (the spike run also registered the other events documented in issue #6; only SessionStart matters here):

```json
{"hooks": {"SessionStart": [{"hooks": [{"type": "command", "command": "python3 $SPIKE/hook.py SessionStart $SPIKE/capture.jsonl"}]}]}}
```

Write the file with `$SPIKE` expanded to the real path; the variable is not set inside the claude process. The spike row of the listing is read with `claude agents --json | jq -c --arg id "$UUID" '[.[] | select(.sessionId==$id)]'`.

## 1. Start with a Mesa-generated id

```sh
UUID=$(uuidgen | tr 'A-Z' 'a-z')   # 36c173f2-803e-4845-bd97-a032b37c6d6d, the agent session id
MID=$(uuidgen | tr 'A-Z' 'a-z')    # 7d83518b-f5e7-4c84-abfb-9839105f88c7, the Mesa session id
env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" PATH="$PATH" SHELL="$SHELL" LANG="$LANG" TMPDIR="$TMPDIR" TERM=xterm-256color \
  tmux -L mesa-spike -f /dev/null start-server \; set-option -g remain-on-exit on \; set-option -g history-limit 10000 \; \
  new-session -d -s spike -n claude-36c173 -c "$TMPDIR/mesa-spike.proj" \
  -e MESA_SESSION_ID="$MID" -e MESA_PROFILE=spike -x 200 -y 50 \
  "claude --session-id $UUID --settings $SPIKE/settings.json --permission-mode manual"
```

`-e` works on tmux 3.7c (`tmux -L mesa-spike show-environment -t spike`):

```
MESA_PROFILE=spike
MESA_SESSION_ID=7d83518b-f5e7-4c84-abfb-9839105f88c7
```

`list-windows -a -F '#{session_name}:#{window_index} #{window_name} #{pane_pid} #{pane_current_command} #{pane_current_path} #{pane_dead}'` right after the start:

```
spike:0 claude-36c173 67213 2.1.281 /private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj 0
```

`pane_pid` is the claude process itself (the same pid as in `claude agents --json`), and `pane_current_command` is the version string `2.1.281`, not `claude`.

The first launch in a new directory shows the trust dialog, with "No, exit" preselected. It was answered with `send-keys Down`, then `send-keys Enter`:

```
 Accessing workspace:
 /private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj
 Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what's in this
 folder first.
 Claude Code'll be able to read, edit, and execute files here.
 Security guide
 ❯ No, exit
   Yes, I trust this folder
 Enter to confirm · Esc to cancel
```

SessionStart fired only after the dialog was accepted (the capture file did not exist before). Payload, `source: "startup"`, `session_id` equal to `$UUID`:

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "hook_event_name": "SessionStart",
  "source": "startup",
  "model": "claude-opus-5-5[1m]"
}
```

Env seen by that hook process (same values on every hook in the session):

```json
{
  "MESA_SESSION_ID": "7d83518b-f5e7-4c84-abfb-9839105f88c7",
  "MESA_PROFILE": "spike",
  "CLAUDE_CODE_SESSION_ID": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "CLAUDE_PROJECT_DIR": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "TMUX_PANE": "%0",
  "TMUX_is_set": true
}
```

`claude agents --json`, spike row, right after the start:

```json
[{"pid":67213,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276764032,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-55","status":"idle"}]
```

## 2. Transcript file and the escaping rule

At the start, before any prompt, `~/.claude/projects/` had no folder for the scratch directory. The folder and file appeared when the first prompt was submitted:

```
$ ls -la $HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/
-rw-------@  1 $USER  staff  173760 Sep 24 12:06 36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl
drwxr-xr-x@  2 $USER  staff      64 Sep 24 12:06 memory
```

Escaping rule observed:

- The path is the physical path with symlinks resolved. tmux was given `-c $TMPDIR/mesa-spike.proj`, which is `/var/folders/...`; Claude Code, `pane_current_path`, the hook `cwd`, and the listing all report `/private/var/folders/...` (`/var` is a symlink to `/private/var` on macOS).
- Every character outside `[A-Za-z0-9]` becomes `-`: `/` maps to `-`, `.` maps to `-` (`mesa-spike.proj` becomes `mesa-spike-proj`), `-` stays `-`, and case is kept (`T`).
- `/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj` becomes `-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj`.
- The docs add that names over 200 characters are truncated and suffixed with a hash; that was not exercised.

After the first session: 53 lines, and 50 of them carry `"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d"` (`jq -r '.sessionId // "none"' | sort | uniq -c`).

## 3. Polite exit

`send-keys -l '/exit'`, then `send-keys Enter`. The slash-command menu opens while typing; Enter runs `/exit`. With `remain-on-exit on` the window stays, and the pane shows:

```
Resume this session with:
claude --resume 36c173f2-803e-4845-bd97-a032b37c6d6d
Pane is dead (status 0, Thu Sep 24 12:08:46 2026)
```

```
$ tmux -L mesa-spike list-windows -a -F '#{session_name}:#{window_index} #{window_name} pane_pid=#{pane_pid} cmd=#{pane_current_command} dead=#{pane_dead} status=#{pane_dead_status} signal=#{pane_dead_signal} time=#{pane_dead_time}'
spike:0 claude-36c173 pane_pid=67213 cmd=claude dead=1 status=0 signal= time=1790276926
```

SessionEnd fired with `"reason":"prompt_input_exit"`, and the spike row left `claude agents --json` (the filtered output was `[]`).

`kill-window -t spike:0` on that dead window then removed the session and, because it was the last one, the server: `no server running on /private/tmp/tmux-501/mesa-spike`.

## 4. Resume

The server was gone, so the resume created the session again with the same window name and the same `MESA_SESSION_ID`:

```sh
env -i ... tmux -L mesa-spike -f /dev/null start-server \; set-option -g remain-on-exit on \; set-option -g history-limit 10000 \; \
  new-session -d -s spike -n claude-36c173 -c "$TMPDIR/mesa-spike.proj" \
  -e MESA_SESSION_ID="$MID" -e MESA_PROFILE=spike -x 200 -y 50 \
  "claude --resume $UUID --settings $SPIKE/settings.json --permission-mode manual"
```

No trust dialog the second time. The screen reopened on the previous conversation:

```
❯ Use the Bash tool to run exactly this command in the current directory: touch spike.txt
  Ran 1 shell command
⏺ I ran touch spike.txt in the current directory and it finished without errors, so spike.txt is there now.
✻ Crunched for 6s · done 12:06 PM
❯ Use the AskUserQuestion tool to ask me whether I prefer red or blue. After I answer, reply with my answer in one word.
⏺ User answered Claude's questions:
  ⎿  · Do you prefer red or blue? → Blue
⏺ Blue
✻ Worked for 4s · done 12:07 PM
```

SessionStart on resume, `source: "resume"`, same `session_id`:

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "hook_event_name": "SessionStart",
  "source": "resume",
  "seconds_since_last_response": 107,
  "context_tokens": 52255,
  "prompt_cache_likely_expired": false,
  "estimated_cache_write_usd": 0.418
}
```

Listing row after the resume: new `pid`, new `startedAt`, same `sessionId`, and a different auto-derived `name`:

```json
[{"pid":75186,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276958673,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-36","status":"idle"}]
```

Continuity check: the prompt `Which color did I pick earlier? Answer in one word.` was answered with `Blue`. The same transcript file grew from 53 to 72 lines, and no new `.jsonl` was created for that conversation. A second session in the same run (`5738b489-...`, exited with `/exit` and resumed the same way) also came back with `"source":"resume"` and its own `session_id`.

## 5. Headless

Run from the scratch directory under the same `env -i` wrapper, so `CLAUDECODE` and the other parent `CLAUDE_*` variables were unset. `claude -p "say hi" --output-format json`, exit code 0, empty stderr:

```json
{
  "duration_api_ms": 5451,
  "stop_reason": "end_turn",
  "session_id": "2dfa03c4-59ac-4f55-82ed-168f0bd62c83",
  "total_cost_usd": 0.1864496,
  "usage": {
    "input_tokens": 2,
    "cache_creation_input_tokens": 22333,
    "cache_read_input_tokens": 10588,
    "output_tokens": 283,
    "output_tokens_details": {
      "thinking_tokens": 180
    },
    "server_tool_use": {
      "web_search_requests": 0,
      "web_fetch_requests": 0
    },
    "service_tier": "standard",
    "cache_creation": {
      "ephemeral_1h_input_tokens": 22333,
      "ephemeral_5m_input_tokens": 0
    },
    "inference_geo": "not_available",
    "iterations": [
      {
        "input_tokens": 2,
        "output_tokens": 283,
        "cache_read_input_tokens": 10588,
        "cache_creation_input_tokens": 22333,
        "cache_creation": {
          "ephemeral_5m_input_tokens": 0,
          "ephemeral_1h_input_tokens": 22333
        },
        "type": "message"
      }
    ],
    "speed": "standard"
  },
  "modelUsage": {
    "claude-opus-5-5[1m]": {
      "inputTokens": 2,
      "outputTokens": 283,
      "cacheReadInputTokens": 10588,
      "cacheCreationInputTokens": 22333,
      "webSearchRequests": 0,
      "costUSD": 0.1864496,
      "contextWindow": 1000000,
      "maxOutputTokens": 128000,
      "thinkingTokens": 180,
      "canonicalModel": "claude-opus-5-5",
      "provider": "firstParty",
      "costBasis": "list"
    }
  },
  "permission_denials": [],
  "terminal_reason": "completed",
  "fast_mode_state": "off",
  "fast_mode_disabled_reason": "sdk_opt_in_required",
  "subagent_stats": {
    "spawned": 0,
    "requested": {
      "background": 0,
      "foreground": 0,
      "unset": 0
    },
    "started_in_background": 0,
    "max_depth": 0,
    "spawned_by_subagents": 0,
    "completed": 0,
    "failed": 0,
    "killed": {
      "parent": 0,
      "user": 0,
      "system": 0
    },
    "refused": {
      "depth_limit": 0,
      "concurrency_limit": 0,
      "budget": 0
    },
    "by_type": {}
  },
  "is_error": false,
  "num_turns": 1,
  "subtype": "success",
  "api_error_status": null,
  "result": "Hi! What are you working on today?\n\nSeveral MCP connectors (<connector names redacted>) need authorization before I can use them. You can connect the claude.ai ones in your claude.ai connector settings, and the rest with `/mcp` in an interactive session.",
  "ttft_ms": 3740,
  "type": "result",
  "duration_ms": 5622,
  "uuid": "c85fd187-b162-42dd-b569-5e6aea089506",
  "ttft_stream_ms": 1945,
  "time_to_request_ms": 98,
  "first_content_frame_ms": 1946,
  "queued_turn_count": 0,
  "result_index": 0
}
```

A headless run also writes `<session_id>.jsonl` into the same `~/.claude/projects/<escaped-cwd>/` folder.

`--max-turns`: it is absent from both `claude --help` and `claude -p --help` (`grep -c -- '--max-turns'` printed `0` for each), but the binary accepts and enforces it.

- `claude -p "say hi" --max-turns 1 --output-format json`: exit code 0. Stderr was `Warning: no stdin data received in 3s, proceeding without it. If piping from a slow command, redirect stdin explicitly: < /dev/null to skip, or wait longer.` Fields (jq projection): `{"type":"result","subtype":"success","is_error":false,"num_turns":1,"terminal_reason":"completed","stop_reason":"end_turn"}`.
- Enforcement, `claude -p "Use the Read tool to read README.md, then tell me its first line." --max-turns 1 --output-format json < /dev/null`: exit code 1, projection `{"type":"result","subtype":"error_max_turns","is_error":true,"num_turns":2,"terminal_reason":"max_turns","stop_reason":"tool_use","result":null,"errors":["Reached maximum number of turns (1)"]}`.

`--json-schema` is present in `claude --help` (`--json-schema <schema>  JSON Schema for structured output validation.`), which ADR-0004 relies on. Live runs, projection `{type,subtype,is_error,num_turns,terminal_reason,stop_reason,structured_output,result}`:

- `claude -p "say hi" --output-format json --json-schema '{"type":"object","properties":{"greeting":{"type":"string"}},"required":["greeting"]}' < /dev/null`, exit code 0: `{"type":"result","subtype":"success","is_error":false,"num_turns":2,"terminal_reason":"completed","stop_reason":"tool_use","structured_output":{"greeting":"Hi!"},"result":"{\"greeting\":\"Hi!\"}"}`
- The same with `--max-turns 1` added, exit code 0: `{"type":"result","subtype":"success","is_error":false,"num_turns":2,"terminal_reason":"completed","stop_reason":"tool_use","structured_output":{"greeting":"Hi! What are we working on?"},"result":"{\"greeting\":\"Hi! What are we working on?\"}"}`. The structured-output turn is counted in `num_turns` but does not trip `--max-turns 1`.

## Recommendation

Mesa generates the agent session id itself and passes it with `--session-id`, so it knows the id before claude starts. It writes the session record (agent session id, cwd, window name) first, then opens the window. The SessionStart payload (`session_id`, `source: "startup"`, `transcript_path`) and the `claude agents --json` row confirm the id afterwards. Mesa reads `transcript_path` from the payload instead of rebuilding the escaped path; if it must build one, it uses the realpath of the project directory.

- `uuid`: a random v4 UUID in lowercase (`crypto.randomUUID()` is already lowercase). `shortid`: its first 6 hex characters. The Mesa session id is separate and stays the same across resumes.
- Server options, set when Mesa first starts `mesa-<profile>`: `remain-on-exit on`, `history-limit 10000`, and `focus-events on` (without it, claude shows a hint that tmux focus-events is off and suggests `set -g focus-events on`). When Mesa itself runs inside a Claude Code session, it starts the server with `CLAUDECODE`, `CLAUDE_CODE_*` and `CLAUDE_PID` removed from the environment.

`mesa open` for claude:

```sh
tmux -L mesa-<profile> has-session -t <project>   # exit 1: use new-session -d -s <project> with the same arguments
tmux -L mesa-<profile> new-window -t <project> -n claude-<shortid> -c <project realpath> \
  -e MESA_SESSION_ID=<mesa-session-id> -e MESA_PROFILE=<profile> \
  'claude --session-id <uuid>'
```

`mesa resume` for claude:

```sh
tmux -L mesa-<profile> kill-window -t <project>:claude-<shortid>   # only if a dead window is still there
tmux -L mesa-<profile> has-session -t <project>                     # exit 1: use new-session -d -s <project> with the same arguments
tmux -L mesa-<profile> new-window -t <project> -n claude-<shortid> -c <recorded cwd> \
  -e MESA_SESSION_ID=<mesa-session-id> -e MESA_PROFILE=<profile> \
  'claude --resume <uuid>'
```

- The resume runs in the recorded cwd, because transcripts are keyed by it. Resuming from another directory was not tested.
- Mesa passes no `--permission-mode`, so the user's own default applies. `--settings` is spike-only; Mesa's hooks come from `mesa hooks install` (ADR-0003).
- Polite stop: `send-keys -l '/exit'`, then `send-keys Enter`. Expect SessionEnd `reason: "prompt_input_exit"` and `pane_dead_status` 0.
- Liveness before `mesa send`: check `pane_dead` = 0. With `remain-on-exit` the exited agent leaves a dead pane, not a shell, and `pane_current_command` reads `2.1.281` while claude runs, so a `pane_current_command == "claude"` check (ADR-0001's `send` note) never matches a live claude. This is flagged here and not amended in ADR-0001.
- Headless (ADR-0004 adapter): `claude -p "<prompt>" --output-format json [--json-schema '<schema>'] [--max-turns N] < /dev/null`, reading `structured_output`, `is_error`, `subtype`, `session_id`, and `total_cost_usd`.

## Reproduction

1. `PROJ=$TMPDIR/mesa-spike.proj; mkdir -p $PROJ; printf '# Lantern Cove\nA made-up demo project for the Mesa hook spike.\n' > $PROJ/README.md`
2. `SPIKE=$(mktemp -d)`. Write `hook.py` and `settings.json` from "Temporary hook" into `$SPIKE`.
3. Generate `UUID` and `MID` as in section 1, then start the window with the `env -i ... tmux -L mesa-spike ... new-session ... "claude --session-id $UUID ..."` line.
4. `tmux -L mesa-spike capture-pane -p -t spike:0` until the trust dialog shows, then `send-keys -t spike:0 Down` and `send-keys -t spike:0 Enter`.
5. Check `$SPIKE/capture.jsonl` for the SessionStart line (`session_id`, `source`).
6. Send any prompt (`send-keys -l '<text>'`, then `send-keys Enter`), then `ls $HOME/.claude/projects/-private-var-folders-*-T-mesa-spike-proj/`.
7. Exit with `send-keys -l '/exit'` and `send-keys Enter`. Run `capture-pane -p` and `list-windows -F '... #{pane_dead} #{pane_dead_status}'`.
8. `kill-window`, then start the window again with `claude --resume $UUID` (section 4). Check the second SessionStart line, the screen, and the transcript line count.
9. From `$PROJ`: `env -i ... claude -p "say hi" --output-format json`, plus the `--max-turns` and `--json-schema` variants in section 5.
10. Cleanup below.

## Cleanup

Done on 2026-09-24 after the run:

- `tmux -L mesa-spike kill-server`, then removed the stale socket file `/private/tmp/tmux-501/mesa-spike`.
- Deleted `$TMPDIR/mesa-spike.proj` and the `$SPIKE` directory (hook script, settings files, capture files, helper scripts).
- Deleted only `$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/` (the spike's interactive and headless transcripts).
- Deleted the per-session scratchpad folders Claude Code created under `/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/`.
- Left untouched, because they are Claude Code's own state outside the transcript folder: the prompt lines appended to `~/.claude/history.jsonl`, per-session entries under `~/.claude/session-env/`, `~/.claude/file-history/`, and `~/.claude/sessions/`, and the folder-trust entry Claude Code records for the scratch path.
