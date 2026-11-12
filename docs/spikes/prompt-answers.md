# Answering a waiting prompt from Mesa

Date: 2026-11-12 (#1070, epic #902). Claude Code 2.1.322 (Haiku 5.5) and Codex CLI 0.160.0 on macOS.

## Question

For each agent and prompt kind: how does Mesa read the prompt a waiting session shows and its options, and which keys choose each option, so `mesa answer`, the desktop card and the phone can answer it without attaching to the pane?

## What was run

A throwaway profile with an invented git project, its own tmux socket, sessions opened by this worktree's `mesa open`. The installed Mesa's hooks logged events (the throwaway `config.yaml` was cut to the keys that release reads, since it refused newer ones). Claude Code ran with the real HOME; the project's own `.claude/settings.json` set `defaultMode: default` and an `ask` rule for `Bash(touch:*)`, because this machine's global mode is `auto`. Codex ran with a temporary `CODEX_HOME` holding a copy of `auth.json` and `approval_policy = "on-request"`, `sandbox_mode = "read-only"`, no hooks. Each agent's folder-trust prompt was accepted once by `tmux send-keys` (invented folder, disposable profile). Everything was removed afterwards.

Each prompt was answered by hand with `tmux send-keys` first, then again through the built `mesa prompt` and `mesa answer`.

## Claude Code

**Reading it.** Every permission and question fires `PermissionRequest` (a question also `PreToolUse` 0.04 s before, as docs/spikes/state-signals.md found), whose payload holds `tool_name` and `tool_input`; a `Notification` (`permission_prompt`) follows 6 s later and says nothing about which prompt, so the reader skips it. The pane's last line is the dialog's footer while it shows (`Esc to cancel · Tab to amend`, or `Enter to select · ↑/↓ to navigate · Esc to cancel`) and is gone the moment it is answered, so a dialog answered in the pane reads as no prompt even before the next hook fires (an approved command's `PostToolUse` only comes once it ends).

Permission, Bash (`fixtures/prompts/bash.txt`) and Write (`write.txt`):

```
 Bash command
 Create empty beacon.txt file
 touch beacon.txt
 Permission rule Bash(touch:*) requires confirmation for this command.

 Do you want to proceed?
 ❯ 1. Yes
   2. No

 Esc to cancel · Tab to amend
```

```
 Do you want to create notes.txt?
 ❯ 1. Yes
   2. Yes, and switch to accept edits (auto-approve file edits and common file
      commands) for this session (shift+tab)
   3. No
```

The options vary (two to four; "always allow" and "switch to auto mode" ones appear), but `1. Yes` is always first and No is always last. Mesa offers only Allow and Deny, never a choice that changes permissions for later.

| Option | Keys | Seen |
| --- | --- | --- |
| allow | `1` | the command ran (`beacon.txt` written, then `PostToolUse`, `Stop`); the Write created `notes.txt` |
| deny | `Escape` | `Interrupted · What should Claude do instead?`, the input prompt open, no hook |

A digit picks its option at once, wherever the cursor is (docs/spikes/state-signals.md run 3 denied with `4` too).

Question, one AskUserQuestion with single-choice options (`question.txt`):

```
 ☐ Color

Do you prefer red or blue?

❯ 1. Red
     Choose red
  2. Blue
     Choose blue
  3. Type something.
────────────────────────────────────────────────────────────────────────────────
  4. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel
```

| Option | Keys | Seen |
| --- | --- | --- |
| option *n* | the digit *n* | `User answered Claude's questions: · Do you prefer red or blue? → Blue`, at once with no Enter |
| typed answer | the digit after the last option (`3`, "Type something."), then the text typed literally, then `Enter` | the row became the text (`question-typing.txt`), then `→ hamsters, honestly` |

The options and the question come from the hook payload; the reader checks the pane shows `1. <first label>`, so a payload for another question is never answered. Several questions (a tab per question and a Submit step) and `multiSelect` were not qualified and read as `unsupported`. So do plan approval (`1. Yes, and auto-accept edits` is not a plain Yes) and folder trust (`folder-trust.txt`), which fires no hook.

## Codex

**Reading it.** Codex's `PermissionRequest` hook carries `tool_name` and `tool_input` (payload in docs/spikes/codex.md) when Mesa's hooks are installed and trusted; this run had none, so the reader also works from the pane alone: the dialog's title, its `$ command` or `Destination:` line, and the footer `Press enter to confirm or esc to cancel` as the last line. Mesa's state came from the screen (`waiting-permission`, 0.6).

Command (`fixtures/panes/waiting-approval.txt`) and edit (`edit-approval.txt`):

```
  Would you like to run the following command?

  Reason: Allow creating lighthouse.txt in the current directory?

  $ touch lighthouse.txt

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for commands that start with `touch
     lighthouse.txt` (p)
  3. No, and tell Codex what to do differently (esc)

  Press enter to confirm or esc to cancel
```

```
  Would you like to make the following edits?

  Description: Apply proposed file edits
  Destination: /src/lantern-cove/README.md

› 1. Yes, proceed (y)
  2. Yes, and don't ask again for these files (a)
  3. No, and tell Codex what to do differently (esc)
```

| Option | Keys | Seen |
| --- | --- | --- |
| allow | `y` | `• Ran touch lighthouse.txt`; the edit `Appended Ahoy to README.md` |
| deny | `Escape` | `✗ You canceled the request to run touch harbor.txt`, `■ Conversation interrupted`, idle prompt |

The "don't ask again" options are never offered.

## Through Mesa

With the reader in place, on the same throwaway sessions:

- `mesa prompt <claude> --json` on the Write dialog: `{"status":"pending","kind":"permission","tool":"Write","summary":"~/…/notes.txt","options":[{"id":"allow",…},{"id":"deny",…}],"freeText":false}`. `mesa answer <s> allow` from inside a Mesa window: refused, exit 2. As a person, with `--prompt <id>`: the file was created and an `answer` receipt written (`via: cli`, the option, the prompt's id, kind, summary, answer). The same answer again: `stale answer: … waits on no prompt Mesa can answer now`.
- An AskUserQuestion: `mesa answer <s> --text "matcha, please" --via app` answered it (`→ matcha, please`); another, `mesa answer <s> 2`, picked South.
- A Bash prompt read with `mesa prompt`, answered with `1` in the pane, then `mesa answer <s> deny --prompt <id>`: refused as stale, and the command had run.
- Codex: `mesa answer <s> allow` ran the command; `deny` cancelled the next one.

A first Codex try said `unsupported` for a pane showing no dialog: the record still held an older `waiting-permission` because no board look had run since. The waiting check now asks the agent's screen reader first and falls back to the record only when the screen says nothing.

## Outcome

- Claude Code permissions (any tool): Allow `1`, Deny `Escape`. One single-choice question: option digits, a typed answer through "Type something.". Other Claude dialogs: `unsupported`.
- Codex command and edit approvals: Allow `y`, Deny `Escape`.
- Antigravity: not qualified; its prompts are answered in the pane.
- A prompt's id hashes the hook event before it with what it asks, so the next prompt, even asking the same, is a different one. Without hooks (Codex here) two identical prompts in a row with no hook between share an id; the pane check still refuses an answer once the dialog is gone.
- Mesa reads a 40-line tail. What the readers check (the footer, `Do you want`, `1. Yes`, a question's first option) sits at the dialog's bottom; only Codex's pane summary (`$ command`) can scroll above a very long dialog, and then the summary is the tool's name.
