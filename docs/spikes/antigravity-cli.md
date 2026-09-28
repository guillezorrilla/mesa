# Spike: installed Antigravity CLI for Mesa sessions

Issue: #265. Date: 2026-09-27. Tested `agy 1.2.12` in an invented Git checkout under a disposable Mesa profile. No user project files or provider permission defaults were changed; the CLI may retain trust for the invented folder. The GUI application and CLI are distinct; the installed terminal executable is `agy`, not `antigravity`.

## Observed

- `agy --help` exposes an interactive TUI, `--prompt-interactive`, `--mode accept-edits|plan`, `--conversation`, `--continue`, and headless `--print` with `--output-format json|stream-json`. It exposes no flag that assigns a new conversation ID. `agy models` succeeded; this installation is authenticated.
- Interactive `agy` first asked whether to trust the invented folder. After confirmation it reached an idle prompt without sending a model request. Ctrl-C twice ended it. The unprompted launch did not replace that folder's entry in `~/.gemini/antigravity-cli/cache/last_conversations.json`.
- `agy --mode plan` reached a prompt visibly marked `Plan mode: research & plan only`; no task was submitted in that mode.
- `agy -p 'Reply with exactly READY.' --model gemini-3.8-flash-low --output-format json --print-timeout 60s` exited 0 with `status: SUCCESS`, `response: "READY\n"`, a UUID `conversation_id`, and token usage. This was a real provider call: 14,693 input and 1 output tokens. A later `agy --conversation <that ID>` in the same checkout displayed the prior prompt and reply, so native resume worked. No tool use or permission request was involved.
- The folder-keyed last-conversation cache held that headless ID. It cannot identify one of several simultaneous live sessions in the same checkout. Mesa must not use `--continue` or the cache alone to resume a particular managed session.

## Integration boundary

The [official headless reference](https://antigravity.google/docs/cli/headless/) specifies a structured result with conversation ID and usage, and notes that approval-required tools in headless mode are soft-denied under the native permission policy. The [resume reference](https://antigravity.google/docs/cli/commands/resume/) documents `--conversation <id>` and the workspace-keyed cache. The [status-line reference](https://antigravity.google/docs/cli/statusline/) exposes current conversation ID, model, context and state to a configured status-line command, but that configuration is global user state, not a per-process launch flag. Mesa should leave native permissions and settings intact.

Headless result parsing and ID-specific resume are supported by the observed CLI. Fresh interactive launch, its native trust prompt, and entry to plan mode are supported. Live interactive ID, state, context, parallel same-checkout ownership, and plan-mode execution remain unqualified. Do not advertise those cells until there is a reliable per-session signal and a real native check. The Antigravity IDE is not a substitute for the CLI TUI.
