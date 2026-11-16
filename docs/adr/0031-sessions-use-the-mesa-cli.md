# ADR-0031: Sessions reach the vault and the Decision model through the mesa CLI

Status: accepted, supersedes the mounts of ADR-0011, ADR-0012 and ADR-0019 (mesa-decisions)
Date: 2026-11-16

## Context

ADR-0012 mounts mesa-vault (`mesa vault mcp`, ADR-0011) on every Claude Code and Codex launch, and Antigravity reads one global entry. ADR-0019 adds mesa-decisions (`mesa decisions mcp`) beside it while the profile has a Decision model. Each is a full copy of the mesa executable that lives as long as its session, so every session runs two of them.

Evidence, from the owner's Mac (docs/spikes/app-efficiency.md, #1229):

- **Memory.** 37 idle `mesa vault mcp` and `mesa decisions mcp` processes at about 52 MB footprint each, about 1.9 GB. On 2026-11-16 there were 34 at 54.4 MB each, 1,851 MB. A fresh one measures 70.7 MB as the app's executable.
- **Use.** The hook logs show 4,728 Mesa MCP calls in 618 of 682 sessions: 3,728 `search_vault`, 587 `project_context`, 321 `read_note`, 60 `save_decision`, 24 `decision_evaluate`. Most sessions make a few reads, so the servers mostly sit idle.
- **A CLI call** costs one mesa start: about 0.11 CPU-s and 111 MB, for well under a second, then nothing.
- **Tokens.** Claude Code defers MCP tool schemas: a session carries the nine tool names, and pays for the schemas (2,608 bytes for mesa-vault's seven tools, about 1.2 KB for decision_evaluate) when it loads them. Codex loads every MCP tool schema into its context up front. The `mesa-vault` skill (7.4 KB) was already linked into every session and was already read on demand. So the skill costs nothing new. Dropping the servers removes the schemas, and costs only the skill's few extra lines naming the commands.

orca (github.com/stablyai/orca) gives its agents its own features through its CLI and a skill (`skills/orca-cli`), with no MCP server. The owner chose the same for Mesa on 2026-11-16.

## Decision

- **No Mesa MCP server in a session.** Claude Code's launch carries no `--mcp-config` for Mesa, Codex's no `mcp_servers` override, and `mesa hooks install` (which the Doctor points to) removes Antigravity's global mesa-vault and mesa-decisions entries and allow rules, any mesa's, leaving the user's own.
- **The Mesa commands.** A session reads the vault with `mesa vault context|search|read|goals`, saves with `mesa vault save decision|summary|note`, and asks the Decision model with `mesa decisions evaluate|advise`, all with `--json`, as the mesa-vault and mesa skills and the session pointer teach. Inside a window each knows the session from `MESA_SESSION_ID`. A save with no `--session` or `--project` is that session's own, on its project, as the tool's was. `mesa vault read` marks the note opened for Impact. `mesa decisions evaluate` marks the decision command used for the session's delivery status.
- **Pre-approved where the tools were.** `agents/mesa-commands.ts` owns the list:
  - Claude Code gets one `Bash(<command>:*)` allow rule per command on every interactive start, resume, fork, host and background launch, and on headless runs.
  - A read-only run (a pipeline skill, ADR-0006) gets `--disallowedTools 'Bash(mesa vault save:*)'`, which wins over the allow.
  - Codex reads Mesa's rules file, `<CODEX_HOME>/rules/mesa.rules`, which `mesa hooks install` writes with one `prefix_rule(..., decision="allow")` per command. An allow rule runs the command without a prompt and outside Codex's sandbox, as the vault and the Decision log are outside the workspace and the servers ran outside it too.
  - Codex has no per-run deny, so a read-only Codex run runs under `env MESA_VAULT_READ_ONLY=1`, which makes `mesa vault save` refuse.
  - Antigravity takes no per-launch rule; its pointer and skills name the commands.
- **The decision command needs no mount.** A session started before the profile chose a model can ask it too, so the delivery status loses its `restart` and `hooks install` actions and the app its buttons for them. The pointer carries the `Decisions:` line while the profile has a model and the session has it on.
- **Deprecated for one release.** `mesa vault mcp` and `mesa decisions mcp` stay, marked deprecated in their help, so sessions already running with them keep working. Removing them, and the records' `vaultMounted` and `decisionsMounted` fields that nothing reads any more, is a follow-up.

## Evidence after

A Claude Code skill run in a throwaway profile under `~/.mesa/`, removed after, asked "when do the harbour lights turn on" of an invented vault note:

- The `claude -p` process had no `mesa vault mcp` or `mesa decisions mcp` child; its only MCP child was the person's own server from their global config.
- It ran `mesa vault search harbour lights --project tide-pool --json` without a prompt (headless, `--permission-mode acceptEdits`, by the allow rule) and answered from the note.

| | Mesa processes per session, idle | Their footprint |
| --- | --- | --- |
| Before | 2 (`vault mcp`, `decisions mcp`) | about 52 to 71 MB each; 1,851 MB for the owner's 17 sessions |
| After | 0 | none; a call starts one mesa for under a second (about 0.11 CPU-s, 111 MB) |

## Consequences

- Each session saves about 105 to 140 MB of standing memory; the owner's Mac about 1.85 GB.
- Each vault read or save is now a process start rather than a call into a running server. At the measured rate, a handful per session, that is well under a second of CPU a session.
- A session cannot ask the vault outside a shell. Every agent Mesa runs has one, and the commands are the ones a person runs.
- Antigravity's commands are not pre-approved: its sessions may ask the person before the first `mesa` call.
- The Claude allow rules lengthen a launch command by about 55 bytes against the old mount, out of the 12,000 Mesa passes to tmux; Codex's is shorter by its four overrides.
