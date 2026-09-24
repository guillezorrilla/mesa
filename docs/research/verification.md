# Plan verification

Date: 2026-09-24. Every source below was read on that date; versions are as installed or as published on npm that day. Per-claim sources with URLs live in `docs/research/sources/`.

## Method

Seven research slices ran in parallel against official docs, Context7, local `--help` output, package registry data, and live commands on this machine (Claude Code 2.1.281, Codex CLI 0.154.0, tmux 3.7c, Obsidian 1.12.7, Node 24.16, pnpm 11.5.2). Each source file marks every claim as verified official, verified locally, or could not verify.

## Summary

| Area | Proposal | Verdict | Record |
| --- | --- | --- | --- |
| Stack: TypeScript, pnpm monorepo, Electron, React, node-pty, xterm.js, vitest | Verified, then the owner replaced Electron with Tauri 2 the same day | Changed | ADR-0002, ADR-0007 |
| Profiles under `~/.mesa/<profile>/config.yaml` | No external dependency; kept as proposed | Held | CONTEXT.md |
| Vault layout (raw, wiki, projects, receipts, daily, AGENTS.md, index.md, log.md) | Files written directly; Obsidian CLI optional | Held, qualified | ADR-0006 |
| `mesa.yaml` per project, registry in profile | Kept as proposed | Held | CONTEXT.md |
| tmux session backend | Confirmed against a live smoke test; naming scheme fixed | Held | ADR-0001 |
| State signals: Claude hooks (SessionStart, UserPromptSubmit, Notification, Stop) and Codex notify | Changed: PermissionRequest is the permission signal, AskUserQuestion is a tool matcher, `claude agents --json` exists, Codex has real hooks and notify is legacy | Changed | ADR-0003 |
| Receipts as markdown with frontmatter | No external dependency; kept | Held | P1 issue |
| Obsidian CLI 1.12+, JSON Canvas for `mesa map` | CLI needs 1.12.7 and a running app; Canvas 1.0 and Bases confirmed | Held, qualified | ADR-0006 |
| Faro: Choice, Score, Noul; adapter via TypeSafe System One adapter on Haiku; jev via API | Changed: primitives confirmed, adapter is Python only, so the adapter backend is written in-house on Anthropic structured outputs | Changed | ADR-0004 |
| Alternatives: wrap an existing board if one covers P2 | None does; build and borrow techniques | Build | ADR-0005 |

## What held

- **Electron stack.** Electron 44.4.5 (Node 24.21, Chromium 152), electron-vite 5.0.0, @xterm/xterm 6.0.0, node-pty 1.1.0 with @electron/rebuild 4.2.0. No macOS TCC permission is needed for spawning tmux or reading `~/.claude`, `~/.codex`, `~/.mesa`. Unsigned local builds run; signing and notarization are P7.
- **tmux.** Persistence across app restart, reachability, send, and tail all verified live on a throwaway socket. A node-pty daemon reaching parity was estimated at 55 to 95 agent hours.
- **AGENTS.md as the only instruction file.** Claude Code 2.1.277+ reads `AGENTS.md` when no `CLAUDE.md` exists; the `/config` setting "Project instructions" defaults to claude-md-or-agents-md. Codex reads `AGENTS.md` natively from the project root down to cwd with a 32 KiB default budget. Codex reads `.agents/skills/`; Claude Code reads `.claude/skills/`. Both folders are populated.
- **Claude Code headless.** `claude -p` with `--output-format json` returns `session_id`, `result`, `total_cost_usd`. `--resume <id>`, `--continue`, `--session-id <uuid>`, `--fork-session` exist. Transcripts live at `~/.claude/projects/<escaped-cwd>/<session-id>.jsonl` and their line format is documented as internal.
- **Codex sessions.** Rollouts live at `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl` with a `session_meta` first line. `codex resume <id>`, `codex exec resume`, and `--last` exist. `codex exec --json` emits thread.started, turn.started, turn.completed, turn.failed, item.* events.
- **Obsidian.** CLI is official from 1.12.7, enabled by a settings toggle, requires the app running, supports `format=json`. JSON Canvas 1.0 and Bases (table, list, cards, kanban, map) match the local skills, except the local Bases skill omits kanban.
- **TypeSafe Jev.** Real, in early access since 2026-09-15. `POST https://api.typesafe.ai/v1/systemone` with a bearer key. Choice returns per-option probabilities plus confidence; Score returns a probability-weighted rubric position plus per-level probabilities plus confidence; Noul returns one calibrated probability. Input is 0.042 USD per million tokens, output free. Also reachable through OpenRouter as `typesafe/jev-1.13`.

## What changed and why

1. **Permission state signal.** Claude Code's `PermissionRequest` hook fires on permission prompts; `Notification` is for idle and general notices. Issues use `PermissionRequest` for `waiting-permission` and `PreToolUse` with matcher `AskUserQuestion` for `waiting-question`. (ADR-0003)
2. **Live session listing.** `claude agents --json` lists running sessions with pid, cwd, sessionId, and status. It is the second signal source and the way foreign sessions appear on the board. (ADR-0003)
3. **Codex signals.** Codex has hooks (`[[hooks.<event>]]` in config.toml) covering session_start, user_prompt_submit, permission_request, stop, and more. `notify` is legacy and never fires on approvals. Issues install Codex hooks first and keep notify as a fallback. (ADR-0003)
4. **Codex headless approvals.** `codex exec` rejects approval requests server-side, and `-a/--ask-for-approval` does not exist on `exec` in 0.154.0 despite the docs. `mesa run` with Codex therefore sets `-c approval_policy=never` with `sandbox_mode=workspace-write`, and Faro's guardrail runs before launch. (P3 issues)
5. **Adapter backend.** The official System One adapter is Python only; the community TypeScript port is one day old with unclear provenance. Mesa's adapter backend calls Anthropic's Messages API with structured outputs on claude-haiku-4-5-20251001 and returns the Jev answer shape. (ADR-0004)
6. **Noul.** Confirmed as the yes-or-no primitive returning one probability, not an open-answer primitive. Free-text routing becomes a Choice over routes plus a Noul for "none". (ADR-0004, CONTEXT.md)
7. **Obsidian CLI.** Optional accelerator, never a dependency: it requires the running app and a manual enable step. Vault writes are files. (ADR-0006)
8. **Electron packaging risk.** electron-builder 26 has open pnpm monorepo ASAR issues (8982, 8986, 9654). A packaging smoke test is the first P7 task. (ADR-0002)

9. **Desktop shell.** After the Electron scaffold was verified, the owner asked for a Rust-based shell. Tauri 2 replaces Electron: Rust core, WKWebView, the app calls the `mesa` CLI through one `run_mesa` command, and the embedded terminal uses the portable-pty crate. This removes the node-pty rebuild and electron-builder risks. (ADR-0007)
10. **Toolchain.** TypeScript stays on the official 7.x package (native `tsc`). typescript-eslint has no TypeScript 7 API to use, so lint and format moved to Biome 2.5, one tool for both.

## Open questions

- Owner constraints added on 2026-09-24: no Anthropic API key (subscriptions only, so the adapter backend runs on `claude -p`), Claude-only v1 with Codex in P3, Obsidian CLI enabled on this machine. See the amendments in ADR-0003 and ADR-0004.
- GitHub Actions does not run for this repo (the owner does not pay for Actions minutes). The gate is `pnpm verify` on pre-push; the workflow is manual-only.

- `--max-turns` is documented for `claude -p` but absent from the installed binary's help. The P0 spike checks it live.
- `claude agents --json` status values beyond `busy` are unknown. The P0 spike enumerates them.
- Whether `codex agents` lists sessions started in a plain terminal, and whether Codex hooks require a trust prompt. P0 spike.
- Whether Obsidian picks up externally created files live. P1 spike.
- Jev's wire format is documented but unverified by a live call. P3 spike, when a key exists.
- Whether node-pty's source build is reliable in CI on macos-latest, or the prebuilt fork is needed. P2 terminal issue.

## ADRs written

- ADR-0001 tmux is the session backend
- ADR-0002 Desktop stack is Electron 44, electron-vite, React, node-pty, xterm 6
- ADR-0003 Session state comes from agent hooks first, agent listings second, tmux tail last
- ADR-0004 Faro uses Jev's primitives behind Mesa's own interface, with an in-house adapter
- ADR-0005 Build the Session Board; borrow techniques, wrap nothing
- ADR-0006 Mesa writes the vault as files; the Obsidian CLI is optional
- ADR-0007 The desktop app is a Tauri 2 shell over the mesa CLI (supersedes ADR-0002)

## Sources

- `sources/claude-code.md`: code.claude.com docs, local `claude --help` and `claude agents --json`, registry lookup of @anthropic-ai/claude-agent-sdk 0.3.281.
- `sources/codex-cli.md`: learn.chatgpt.com/docs, Context7 openai/codex at rust-v0.154.0, local `codex --help` for every subcommand, `~/.codex` layout.
- `sources/electron-stack.md`: electronjs.org docs, releases.electronjs.org, registry lookups for every package, Apple TN3147 and Hardened Runtime docs.
- `sources/tmux-vs-node-pty.md`: tmux 3.7c man page, live smoke test transcript.
- `sources/obsidian.md`: obsidian.md/help/cli, /bases, /properties, jsoncanvas.org/spec/1.0, kepano/obsidian-skills, local bundle binary.
- `sources/typesafe-jev.md`: typesafe.ai, docs.typesafe.ai, package registries, platform.claude.com structured outputs and pricing.
- `sources/alternatives.md`: 18 repositories via `gh api` and READMEs.
