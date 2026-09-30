# ADR-0012: Every session mounts mesa-vault through its agent's own mechanism

Status: accepted
Date: 2026-09-29

## Context

P5 (#157) gives every Mesa session the profile's vault through the `mesa-vault` MCP server (#300) at a small standing cost. The three agents Mesa runs mount MCP servers differently, and none keeps a per-launch mount across a resume. The spike #292 (`docs/spikes/vault-mcp.md`) mounted a stand-in server in Claude Code 2.1.284, Codex CLI 0.157.1, and Antigravity CLI 1.2.13 and recorded, per agent, what binds the server to the Mesa window, what pre-approves its tools, and what each lifecycle path keeps. The owner decided on 2026-09-29 to pre-approve every `mesa-vault` tool, and that Antigravity's pre-approval is one global allow rule that `mesa hooks install` adds.

## Decision

- **The server.** Every agent starts `mesa vault mcp` as this mesa's own argv (`MesaDeps.self`, the argv the hooks use) followed by `vault mcp`, named `mesa-vault` in every config. It takes no `--profile`: it binds to the window's `MESA_SESSION_ID` and `MESA_PROFILE`, which every agent passes on, so one command line serves every profile and lists no tools outside a live Mesa session.
- **Claude Code.** Every start, resume, fork, background start (`claude --bg`), and headless run carries `--mcp-config=<inline JSON>` (one `stdio` server, no `env`) and `--allowedTools=mcp__mesa-vault`. The `=` forms keep a goal after these variadic flags as the prompt. A headless run passes `--mcp-config=<json>` and puts `mcp__mesa-vault` first in the `--allowedTools` list it ends with, before the profile's own rules. Mesa never passes `--strict-mcp-config`, which would drop the user's own servers.
- **Codex.** Every start, resume, fork, and `codex exec` carries four `-c` overrides: `mcp_servers.mesa-vault.command`, `.args`, `.env_vars=["MESA_SESSION_ID","MESA_PROFILE"]`, and `.default_tools_approval_mode="approve"`. `-c mesa.embedded=true` stays as ADR-0003 has it.
- **Antigravity.** agy takes no MCP server or pre-approval per launch, so nothing changes in its argv. `mesa hooks install` writes one entry, `mesa-vault` (`command` and `args`, no `env`), under `mcpServers` in `~/.gemini/config/mcp_config.json`, and one string, `mcp(mesa-vault/*)`, in `permissions.allow` of `~/.gemini/antigravity-cli/settings.json`. `mesa hooks uninstall` removes only that entry and that string, and removes a file it leaves holding only `{"mcpServers":{}}` or `{"permissions":{"allow":[]}}`, so a machine with no file before install has none after. A `mesa-vault` entry that is not Mesa's, or a file whose shape Mesa cannot read, is a conflict: Mesa leaves both files as they were, reports the reason in `mesa hooks status`, Doctor (`antigravity vault`), and install's warning, and the Claude Code and Codex hooks carry on. An entry that runs another mesa is stale, and install replaces it; an entry the user disabled (`"disabled": true`) is reported disabled and stays disabled on install.
- **One owner.** `packages/core/src/agents/vault-mount.ts` builds the server and each agent's mount words; the `AGENTS` builders take the server as a required parameter, so no launch path can leave it out, and the launch owner's `LaunchDeps.vaultServer` is wired once in the sessions service. `agents/antigravity/vault-mount.ts` owns the global entry and rule.
- **What a session reports.** The launch owner marks a Claude Code or Codex record `vaultMounted: true` when the command it runs carries the mount (a resume of a background session keeps the mark of the process it attaches to). `mesa show <id> --json` has `vault: {state, reason}`: `configured` for a marked record; `missing` for an unmarked one, queued ("Mounted when the queued session starts"), only recorded by `mesa adopt --no-resume`, or launched before this change ("Resume through Mesa to mount the vault"); Antigravity's from its global entry and rule (`missing` when absent, disabled, or without the rule; `conflicting` when stale, foreign, or unreadable; `configured`); `unsupported` for a plain terminal. It describes configuration, not proof that the server answered, like the instruction status (ADR-0010). Session details in the app shows it next to the instruction status.
- **The pointer** (ADR-0010) names the tools, when to save with them, and the `mesa vault context <project> --json` fallback (`--general` for a General session), and carries no vault content.

Not supported, or not pre-approvable per launch:

- Antigravity has no per-launch mount or pre-approval: the one global entry and rule apply to every `agy` on the machine, including ones outside Mesa, where the server lists no tools. It has no `/compact`.
- A plain terminal session runs no agent.
- A session record adopted without a resume (`mesa adopt --no-resume`), and any process started outside Mesa, run without the mount: Mesa cannot retrofit argv, as ADR-0010 says for the pointer.
- Inferred from the spike, not observed: Claude Code fork and background start, Codex fork, and a Codex resume in a different window reaching the server with the new window's ID. The provider qualification (#302) checks them.

## Evidence

From `docs/spikes/vault-mcp.md`: with `--allowedTools=mcp__mesa-vault`, Claude Code called `project_context` in `--permission-mode default` with no prompt, and without it stopped at the tool prompt. A Claude resume without the flags started no server; with them it started one bound to the window's session. Codex without `env_vars` gave the server no `MESA_*` variables, and `codex exec` without `approve` failed the call under `approval_policy=never`; with both, the call completed interactively and headless. Antigravity headless auto-denied the MCP call without a rule; with the global entry `mesa-vault` and the rule `mcp(mesa-vault/*)`, a headless and an interactive turn both called the tool with no prompt and no denial, and the rule covered the tool name `mesa-vault/project_context`. The standing cost was 0 tokens for Claude Code and Codex, which defer MCP tools, and about 850 tokens for Antigravity, the same for a 3-note and a 300-note vault.

## Consequences

- Every Claude Code and Codex command line grows by the mount (about 150 bytes with the test mesa path); the goal byte limit Mesa checks before tmux (`requireCommandFits`) counts it.
- A session started before this change has no mount until it is resumed through Mesa; `show` reports it `missing`, as its record has no `vaultMounted`. The mark records what Mesa launched, not what the running process holds.
- Antigravity sessions pay the tool list on every request while the entry is installed, and share the schema cache Antigravity keeps per server name; #300 and #302 check that race.
- Moving the mesa checkout makes the Antigravity entry stale until `mesa hooks install` runs again, as for its hook; Claude Code and Codex pick up the new path at their next launch.
