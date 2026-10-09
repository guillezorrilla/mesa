# Spike: Claude Code state signals end to end

Issue: #6. Date: 2026-09-24. macOS (Darwin 25.6.0), tmux 3.7c, Claude Code 2.1.281 for run 1 and 2.1.282 from its resume onward (the binary auto-updated during the spike; no signal differed between the two).

Codex: the optional Codex items (hook payloads, the hook trust step, `codex agents`) are open and tracked in #43. v1 is Claude Code only.

Edits to captured output: the home directory is shown as `$HOME`, the username as `$USER`, and the per-user temp segment `/var/folders/<2 chars>/<hash>` as `/var/folders/XX/XXXXXXXX` (also in its escaped form `-var-folders-XX-XXXXXXXX`). Those are the only edits to the verbatim payloads; JSON is pretty-printed with `jq`. `claude agents --json` lists every live session on the machine; only the spike session's row is shown. Screen captures are trimmed to the relevant lines (banner and status line dropped).

## Setup

- Scratch project `$TMPDIR/mesa-spike.proj` holding a two-line invented `README.md`.
- Hooks were loaded per session with `claude --settings <file>`, confirmed in `claude --help`: `--settings <file-or-json>  Path to a settings JSON file or a JSON string to load additional settings from`. `~/.claude/settings.json` was not modified. Its existing user hooks (a desktop `Notification` hook and a `WorktreeCreate` hook) still ran alongside.
- `--permission-mode manual` was passed because this machine's global `defaultMode` is `auto`, which could approve `touch` without showing a prompt. The installed CLI has no `default` value; `manual` is the prompt-every-time mode. Hook payloads report it as `"permission_mode":"default"`.
- A throwaway tmux server, `tmux -L mesa-spike -f /dev/null`, started under `env -i` with only `HOME USER LOGNAME PATH SHELL LANG TMPDIR TERM`. The spike ran from inside a Claude Code session, whose `CLAUDECODE`, `CLAUDE_CODE_SESSION_ID` and other `CLAUDE_*` variables would otherwise reach the tmux server's global environment. `claude agents --json` was also run under `env -i`.
- Window: `new-session -d -s spike -n claude-36c173 -c "$TMPDIR/mesa-spike.proj" -e MESA_SESSION_ID=7d83518b-f5e7-4c84-abfb-9839105f88c7 -e MESA_PROFILE=spike -x 200 -y 50 "claude --session-id 36c173f2-803e-4845-bd97-a032b37c6d6d --settings $SPIKE/settings.json --permission-mode manual"`, with `remain-on-exit on` set globally on the spike server first.

## Temporary hook

`$SPIKE` is a temp directory (`SPIKE=$(mktemp -d)`). `$SPIKE/hook.py`:

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

`$SPIKE/settings.json` is generated so that the absolute path is baked in:

```sh
python3 - "$SPIKE" <<'EOF'
import json, sys
sp = sys.argv[1]
def cmd(ev):
    return [{"type": "command", "command": f"python3 {sp}/hook.py {ev} {sp}/capture.jsonl"}]
hooks = {ev: [{"hooks": cmd(ev)}] for ev in
         ["SessionStart", "UserPromptSubmit", "PermissionRequest", "Notification", "Stop", "SessionEnd"]}
hooks["PreToolUse"] = [{"matcher": "AskUserQuestion", "hooks": cmd("PreToolUse")}]
json.dump({"hooks": hooks}, open(f"{sp}/settings.json", "w"), indent=2)
EOF
```

The spike row of the listing: `claude agents --json | jq -c --arg id "$UUID" '[.[] | select(.sessionId==$id)]'`, polled roughly every 0.8 s during transitions (each call took about 0.5 s).

## Run 1: timeline

Session `36c173f2-803e-4845-bd97-a032b37c6d6d`. `t` is seconds after the first SessionStart. Hook rows come from `capture.jsonl`; listing rows are the first poll that showed a new status.

| t (s) | Action | Hook event (detail) | `claude agents` status |
| --- | --- | --- | --- |
| -19.7 | before launch | | row absent |
| 0.0 | trust dialog accepted | SessionStart (`startup`) | |
| 8.5 | | | `idle` |
| 27.1 | sent "Use the Bash tool to run exactly this command in the current directory: touch spike.txt" | UserPromptSubmit | |
| 27.7 | | | `busy` |
| 30.7 | permission dialog shown | PermissionRequest (`Bash`) | |
| 31.0 | | | `waiting`, `waitingFor: "permission prompt"` |
| 36.7 | still waiting | Notification (`permission_prompt`) | |
| about 52.5 | approved (Enter on "1. Yes") | none | |
| 53.0 | | | `busy` |
| 55.8 | turn ends | Stop | |
| 55.9 | | | `idle` |
| 64.8 | sent "Use the AskUserQuestion tool to ask me whether I prefer red or blue. After I answer, reply with my answer in one word." | UserPromptSubmit | |
| 65.0 | | | `busy` |
| 67.7 | question shown | PreToolUse (`AskUserQuestion`), then PermissionRequest (`AskUserQuestion`) 0.04 s later | |
| 68.1 | | | `waiting`, `waitingFor: "input needed"` |
| 73.7 | still waiting | Notification (`permission_prompt`) | |
| about 86.5 | answered Blue (Down, Enter) | none | |
| 86.8 | | | `busy` |
| 87.6 | turn ends | Stop | |
| 88.3 | | | `idle` |
| 147.7 | idle 60.1 s after Stop | Notification (`idle_prompt`) | `idle` (at 153.0) |
| 161.8 | `/exit` | SessionEnd (`prompt_input_exit`) | |
| 163.8 | | | row absent |
| 194.8 | `claude --resume` in a new window | SessionStart (`resume`) | `idle` (at 197.1, new pid, same `sessionId`) |
| 213.9 | one recall prompt, then SIGKILL of the claude pid | UserPromptSubmit, Stop, then no SessionEnd | row absent (at 225.7) |

Notification fired for both the permission prompt and the question, 6.0 s after each PermissionRequest, with the same `notification_type` and message. In run 2, where each prompt was answered or dismissed 1 to 1.5 s after it appeared, no `permission_prompt` Notification fired. The `idle_prompt` Notification came 60.1 s after Stop.

## Verbatim payloads

### SessionStart

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

On resume, the same `session_id` with `"source":"resume"` plus `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired`, and `estimated_cache_write_usd`:

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

### UserPromptSubmit

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "e2ef4f32-7aa9-419e-970d-1d76be6f1a9a",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Use the Bash tool to run exactly this command in the current directory: touch spike.txt"
}
```

### PermissionRequest (real Bash permission prompt)

Screen at that moment:

```
 Bash command
   touch spike.txt
   Create empty spike.txt file
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to /private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj from this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No
 Esc to cancel · Tab to amend
```

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "e2ef4f32-7aa9-419e-970d-1d76be6f1a9a",
  "permission_mode": "default",
  "effort": {
    "level": "xhigh"
  },
  "hook_event_name": "PermissionRequest",
  "tool_name": "Bash",
  "tool_input": {
    "command": "touch spike.txt",
    "description": "Create empty spike.txt file"
  },
  "permission_suggestions": [
    {
      "type": "addDirectories",
      "directories": [
        "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj"
      ],
      "destination": "session"
    },
    {
      "type": "setMode",
      "mode": "acceptEdits",
      "destination": "session"
    }
  ]
}
```

### PreToolUse, matcher AskUserQuestion

Screen at that moment:

```
 ☐ Color
Do you prefer red or blue?
❯ 1. Red
     You prefer red.
  2. Blue
     You prefer blue.
  3. Type something.
  4. Chat about this
Enter to select · ↑/↓ to navigate · Esc to cancel
```

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "943c805f-bdaa-428d-95e3-a37db52a67a2",
  "permission_mode": "default",
  "effort": {
    "level": "xhigh"
  },
  "hook_event_name": "PreToolUse",
  "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [
      {
        "question": "Do you prefer red or blue?",
        "header": "Color",
        "options": [
          {
            "label": "Red",
            "description": "You prefer red."
          },
          {
            "label": "Blue",
            "description": "You prefer blue."
          }
        ],
        "multiSelect": false
      }
    ]
  },
  "tool_use_id": "toolu_01W6GVC7FbhAwZbDxEntTMx5"
}
```

PermissionRequest also fires for the question, 0.04 s after PreToolUse, with `tool_name: "AskUserQuestion"`:

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "943c805f-bdaa-428d-95e3-a37db52a67a2",
  "permission_mode": "default",
  "effort": {
    "level": "xhigh"
  },
  "hook_event_name": "PermissionRequest",
  "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [
      {
        "question": "Do you prefer red or blue?",
        "header": "Color",
        "options": [
          {
            "label": "Red",
            "description": "You prefer red."
          },
          {
            "label": "Blue",
            "description": "You prefer blue."
          }
        ],
        "multiSelect": false
      }
    ]
  }
}
```

### Notification

On the permission prompt, and identical in `message` and `notification_type` on the AskUserQuestion prompt:

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "e2ef4f32-7aa9-419e-970d-1d76be6f1a9a",
  "hook_event_name": "Notification",
  "message": "Claude needs your permission",
  "notification_type": "permission_prompt"
}
```

On idle, 60.1 s after Stop:

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "943c805f-bdaa-428d-95e3-a37db52a67a2",
  "hook_event_name": "Notification",
  "message": "Claude is waiting for your input",
  "notification_type": "idle_prompt"
}
```

### Stop

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "e2ef4f32-7aa9-419e-970d-1d76be6f1a9a",
  "permission_mode": "default",
  "effort": {
    "level": "xhigh"
  },
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "I ran `touch spike.txt` in the current directory and it finished without errors, so `spike.txt` is there now.",
  "background_tasks": [],
  "session_crons": []
}
```

### SessionEnd

After `/exit`:

```json
{
  "session_id": "36c173f2-803e-4845-bd97-a032b37c6d6d",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/36c173f2-803e-4845-bd97-a032b37c6d6d/scratchpad",
  "prompt_id": "7f592ab6-93c4-4ffb-a1f0-695a4dd422a5",
  "hook_event_name": "SessionEnd",
  "reason": "prompt_input_exit"
}
```

## `claude agents --json`

Full field set of the row: `pid`, `cwd`, `kind`, `startedAt`, `sessionId`, `name`, `status`, plus `waitingFor` only while `status` is `waiting`. `pid` equals tmux `pane_pid`. `name` is derived automatically and changed across the resume (`mesa-spike-proj-55`, then `mesa-spike-proj-36`), so Mesa keys on `sessionId`.

| Lifecycle point | Observed |
| --- | --- |
| before launch | row absent |
| start, at the input prompt | `"status":"idle"` |
| working on a prompt | `"status":"busy"` |
| permission wait | `"status":"waiting","waitingFor":"permission prompt"` |
| AskUserQuestion wait | `"status":"waiting","waitingFor":"input needed"` |
| after Stop, and idle past 60 s | `"status":"idle"` |
| after a denied permission (run 2) | `"status":"idle"` |
| after `/exit` | row absent |
| after resume | `"status":"idle"`, new `pid` and `startedAt`, same `sessionId` |
| after SIGKILL | row absent |

Verbatim rows:

```json
[{"pid":67213,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276764032,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-55","status":"idle"}]
[{"pid":67213,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276764032,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-55","status":"busy"}]
[{"pid":67213,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276764032,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-55","status":"waiting","waitingFor":"permission prompt"}]
[{"pid":67213,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276764032,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-55","status":"waiting","waitingFor":"input needed"}]
[]
[{"pid":75186,"cwd":"/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj","kind":"interactive","startedAt":1790276958673,"sessionId":"36c173f2-803e-4845-bd97-a032b37c6d6d","name":"mesa-spike-proj-36","status":"idle"}]
```

## MESA_SESSION_ID inside hook processes

Yes. `MESA_SESSION_ID` and `MESA_PROFILE`, set with `tmux new-session -e` or `new-window -e`, reached every hook invocation: 34 across the three runs, 15 of them in run 1 across both launches. In all 34, `CLAUDE_CODE_SESSION_ID` equalled the payload's `session_id`. The hook's parent pid was the claude pid (67213, then 75186 after the resume). Values from the hook's environment (the `env` object written by `hook.py`):

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

`TMUX_PANE` is set too, so a hook can also find its tmux pane. Variable names in the hook environment (values omitted). `CLAUDE_ENV_FILE` appears on SessionStart only, `CLAUDE_EFFORT` on PreToolUse, PermissionRequest, PostToolUse and Stop, and the `CLAUDE_CODE_MESSAGING_*` pair is missing on SessionEnd:

```
AI_AGENT CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT CLAUDE_ENV_FILE CLAUDE_PID CLAUDE_PROJECT_DIR COLORTERM COLUMNS COREPACK_ENABLE_AUTO_PIN HOME LANG LINES LOGNAME MESA_PROFILE MESA_SESSION_ID NoDefaultCurrentDirectoryInExePath PATH PWD SHELL SHLVL TERM TERM_PROGRAM TERM_PROGRAM_VERSION TMPDIR TMUX TMUX_PANE USER _ __CF_USER_TEXT_ENCODING
```

## Runs 2 and 3: leaving a wait, denial, crash

Run 2 was a second session (`5738b489-4c07-437d-9092-216dd039f7a0`, Mesa id `b967cdcd-1bfe-44a3-9cb4-53140b29cae8`) with the same seven hooks plus `PostToolUse` (no matcher). Run 3 resumed it with `PostToolUseFailure` and `PermissionDenied` added as well. `t` is seconds after each run's SessionStart.

| Run | t (s) | Action | Hook events |
| --- | --- | --- | --- |
| 2 | 16.6 | touch prompt, dialog shown | PermissionRequest (`Bash`) |
| 2 | 18.8 | approved about 1 s after the dialog | PostToolUse (`Bash`), then Stop at 20.3 |
| 2 | 23.7 | AskUserQuestion shown | PreToolUse, PermissionRequest (`AskUserQuestion`) |
| 2 | 25.5 | answered Red | PostToolUse (`AskUserQuestion`), then Stop at 27.0 |
| 2 | 30.6 | touch prompt, dialog shown | PermissionRequest (`Bash`) |
| 2 | about 31.6 | Esc | none: no PostToolUse, no Stop, no Notification until `/exit` at 148.3 (117 s) |
| 3 | 12.8 | touch prompt, dialog shown, then Esc | PermissionRequest (`Bash`), then none |
| 3 | 21.8 | touch prompt, dialog shown, then "4" (No) | PermissionRequest (`Bash`), then none |
| 3 | 42.9 | `/exit` | SessionEnd (`prompt_input_exit`) |

Both denials left the screen showing `Interrupted` and `What should Claude do instead?` with the input prompt open, and the listing read `"status":"idle"`. `PostToolUseFailure` and `PermissionDenied` did not fire for a user denial (the docs describe `PermissionDenied` as an auto mode event).

PostToolUse after the approved Bash call:

```json
{
  "session_id": "5738b489-4c07-437d-9092-216dd039f7a0",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/5738b489-4c07-437d-9092-216dd039f7a0.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/5738b489-4c07-437d-9092-216dd039f7a0/scratchpad",
  "prompt_id": "c75c536e-b695-478c-814e-e26ea00f5e6c",
  "permission_mode": "default",
  "effort": {
    "level": "xhigh"
  },
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "touch spike2.txt",
    "description": "Create empty file spike2.txt"
  },
  "tool_response": {
    "stdout": "",
    "stderr": "",
    "interrupted": false,
    "isImage": false,
    "noOutputExpected": true
  },
  "tool_use_id": "toolu_012CcWUxXJNWi7eVS8oTWpPb",
  "duration_ms": 873
}
```

PostToolUse after the answered question carries the answer in `tool_response.answers`:

```json
{
  "session_id": "5738b489-4c07-437d-9092-216dd039f7a0",
  "transcript_path": "$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/5738b489-4c07-437d-9092-216dd039f7a0.jsonl",
  "cwd": "/private/var/folders/XX/XXXXXXXX/T/mesa-spike.proj",
  "scratchpad_dir": "/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/5738b489-4c07-437d-9092-216dd039f7a0/scratchpad",
  "prompt_id": "41d53183-0cba-4121-9819-231fca280a6e",
  "permission_mode": "default",
  "effort": {
    "level": "xhigh"
  },
  "hook_event_name": "PostToolUse",
  "tool_name": "AskUserQuestion",
  "tool_input": {
    "questions": [
      {
        "question": "Do you prefer red or blue?",
        "header": "Color",
        "options": [
          {
            "label": "Red",
            "description": "You prefer red."
          },
          {
            "label": "Blue",
            "description": "You prefer blue."
          }
        ],
        "multiSelect": false
      }
    ],
    "answers": {
      "Do you prefer red or blue?": "Red"
    },
    "annotations": {}
  },
  "tool_response": {
    "questions": [
      {
        "question": "Do you prefer red or blue?",
        "header": "Color",
        "options": [
          {
            "label": "Red",
            "description": "You prefer red."
          },
          {
            "label": "Blue",
            "description": "You prefer blue."
          }
        ],
        "multiSelect": false
      }
    ],
    "answers": {
      "Do you prefer red or blue?": "Red"
    },
    "annotations": {}
  },
  "tool_use_id": "toolu_01Rwku1Be9vWHicfSM6d7Lyy",
  "duration_ms": 0
}
```

Crash, run 1 after the resume: `kill -9 <claude pid>`. No SessionEnd or Stop fired, the listing row disappeared, and tmux kept the dead pane:

```
Pane is dead (signal kill, Thu Sep 24 12:09:47 2026)
spike:0 claude-36c173 pane_pid=75186 cmd=claude dead=1 status= signal=kill
```

For comparison, after `/exit` the same `list-windows` format printed `dead=1 status=0 signal=`, and the pane said `Pane is dead (status 0, ...)`.

## Mapping to session states

Confidence tiers follow ADR-0003: a fresh hook event 0.95, an agent listing 0.85, tail text capped at 0.6. tmux process state (`pane_dead`, `pane_dead_status`, `pane_dead_signal`) is a process fact, not pane text, so this spike proposes the listing tier (0.85) for it.

| Signal | Condition | State | Confidence |
| --- | --- | --- | --- |
| SessionStart | `source` `startup` or `resume` | `idle` | 0.95 |
| UserPromptSubmit | any | `working` | 0.95 |
| PermissionRequest | `tool_name` is not `AskUserQuestion` | `waiting-permission` | 0.95 |
| PreToolUse, matcher AskUserQuestion | or PermissionRequest with `tool_name` `AskUserQuestion` | `waiting-question` | 0.95 |
| PostToolUse (proposed addition) | any tool, after an approval or an answer | `working` | 0.95 |
| Notification `permission_prompt` | fires about 6 s into either wait, same message for both | no change; keeps the current waiting state | none |
| Notification `idle_prompt` | 60 s after Stop | `idle` | 0.95 |
| Stop | turn end | `idle` | 0.95 |
| SessionEnd | any `reason` (`prompt_input_exit` observed) | `done` | 0.95 |
| StopFailure (not captured) | API error ends the turn | `failed` | 0.95, unverified |
| listing `busy` | | `working` | 0.85 |
| listing `waiting` + `waitingFor: "permission prompt"` | | `waiting-permission` | 0.85 |
| listing `waiting` + `waitingFor: "input needed"` | | `waiting-question` | 0.85 |
| listing `idle` | | `idle` | 0.85 |
| listing row absent + `pane_dead` 1, `pane_dead_status` 0 | | `done` | 0.85 |
| listing row absent + `pane_dead` 1 with a signal or a nonzero status, no SessionEnd | | `failed` | 0.85 |
| tail text only | for example `Do you want to proceed?`, `Enter to select`, `Interrupted` | matching state | 0.6 at most |

Ordering rule the data calls for: a waiting state from a hook is superseded when a later listing poll says `idle` or `busy`. A user denial fires no hook at all, so without that rule the board would show `waiting-permission` until the next prompt.

## Background work (2026-10-08, #699)

A live run (Claude Code 2.x, a Monitor on `sleep 150 && echo done`, polled every 5 s) showed:

- A background notice (a Monitor event, a `run_in_background` command ending, a subagent handing back) arrives as a prompt: `UserPromptSubmit` with a `prompt` starting `<task-notification>`, then the turn's tool hooks, then `Stop`. Every such turn in the reported session's log ended with `Stop`.
- `Stop`'s payload lists the work still running in `background_tasks`, and `Notification` `idle_prompt` follows 60 s later, once.
- The listing reads `busy` for as long as the background work runs, also between turns, and `idle` once it ends.

So a stale idle hook must not yield to a `busy` listing: before #699 the board read `working` (listing, 0.85) from 60 s after the last idle hook until the work ended. A listing wait still overrides a stale idle hook, because a background subagent's permission hook carries `agent_id` and is not a parent signal.

## Differences from ADR-0003

Recorded as an amendment in `docs/adr/0003-session-state-signals.md`:

1. ADR-0003's Context says no environment variable carries the session id. In fact `CLAUDE_CODE_SESSION_ID` is set in every hook process and equals `session_id`. `MESA_SESSION_ID` and `MESA_PROFILE` from the tmux window are visible as designed.
2. PermissionRequest fires for AskUserQuestion too, so the classifier must branch on `tool_name`.
3. The listing has three status values, `idle`, `busy`, and `waiting` with `waitingFor`, and it distinguishes permission from question waits. The row disappears on both exit and crash.
4. No installed hook marks the return to work after an approval or an answer; PostToolUse does. A denial fires nothing, so the listing must override a stale waiting state.
5. SessionEnd does not fire on SIGKILL; `failed` comes from tmux `pane_dead_signal` or a nonzero `pane_dead_status`.

## Reproduction

1. `PROJ=$TMPDIR/mesa-spike.proj; mkdir -p $PROJ; printf '# Lantern Cove\nA made-up demo project for the Mesa hook spike.\n' > $PROJ/README.md`
2. `SPIKE=$(mktemp -d)`. Write `hook.py`, then generate `settings.json` as in "Temporary hook".
3. `UUID=$(uuidgen | tr 'A-Z' 'a-z'); MID=$(uuidgen | tr 'A-Z' 'a-z')`
4. Start the server and window:
   ```sh
   env -i HOME="$HOME" USER="$USER" LOGNAME="$USER" PATH="$PATH" SHELL="$SHELL" LANG="$LANG" TMPDIR="$TMPDIR" TERM=xterm-256color \
     tmux -L mesa-spike -f /dev/null start-server \; set-option -g remain-on-exit on \; set-option -g history-limit 10000 \; \
     new-session -d -s spike -n claude-${UUID:0:6} -c "$PROJ" -e MESA_SESSION_ID="$MID" -e MESA_PROFILE=spike -x 200 -y 50 \
     "claude --session-id $UUID --settings $SPIKE/settings.json --permission-mode manual"
   ```
5. Poll `tmux -L mesa-spike capture-pane -p -t spike:0` for the trust dialog, then `send-keys -t spike:0 Down` and `send-keys -t spike:0 Enter`.
6. Between steps, poll the listing filter from "Temporary hook" and `tail $SPIKE/capture.jsonl`.
7. Send the touch prompt from the run 1 table (`send-keys -l '<text>'`, then `send-keys Enter`). Wait for PermissionRequest, then about 6 s for Notification, then approve with `send-keys Enter`.
8. Send the AskUserQuestion prompt, wait for PreToolUse and Notification, then answer with `send-keys Down` and `send-keys Enter`.
9. Wait more than 60 s after Stop for the `idle_prompt` Notification.
10. `send-keys -l '/exit'`, then `send-keys Enter`. Read SessionEnd and `list-windows -F '#{pane_dead} #{pane_dead_status} #{pane_dead_signal}'`.
11. Optional, for runs 2 and 3: add `PostToolUse` (and `PostToolUseFailure`, `PermissionDenied`) to the settings, start a new session, and deny a permission prompt with Esc or `4`. For the crash case, resume and `kill -9` the `pane_pid`.
12. Cleanup below.

## Cleanup

Done on 2026-09-24 after the runs:

- `tmux -L mesa-spike kill-server`, then removed the stale socket file `/private/tmp/tmux-501/mesa-spike`. No other tmux server or socket was touched.
- Deleted `$TMPDIR/mesa-spike.proj` (README and the `spike*.txt` files the agent created) and the `$SPIKE` directory (hook script, all settings files, capture files, helper scripts).
- Deleted only `$HOME/.claude/projects/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/` (the transcripts of both spike sessions and the headless runs of issue #7).
- Deleted the per-session scratchpad folders Claude Code created under `/private/tmp/claude-501/-private-var-folders-XX-XXXXXXXX-T-mesa-spike-proj/`.
- `~/.claude/settings.json` and every other global config were never edited. Left untouched, because they are Claude Code's own state outside the transcript folder: the prompt lines appended to `~/.claude/history.jsonl`, per-session entries under `~/.claude/session-env/`, `~/.claude/file-history/`, and `~/.claude/sessions/`, and the folder-trust entry Claude Code records for the scratch path.
