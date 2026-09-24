# ADR-0005: Build the Session Board; borrow techniques, wrap nothing

Status: accepted
Date: 2026-09-24

## Context

Eighteen tools were surveyed (docs/research/sources/alternatives.md). None covers list, state, start, stop, send, terminal, and resume for both Claude Code and Codex with persistence across restarts, a plain-terminal path, and a JSON or API surface. The closest are CCManager (MIT, best state detectors, no JSON or API, no attach to foreign sessions), Happy Coder (MIT, `happy-agent` CLI with `--json` everywhere, relay daemon instead of tmux), recon (MIT, tmux plus Claude Code session files, Claude only), and NTM (tmux plus REST, three months old, non-standard license rider). Crystal, AgentAPI, and Vibe Kanban's cloud are deprecated or shut down. OpenAI's Codex desktop app cannot see CLI-started sessions.

## Decision

Build Mesa's own tmux backend, CLI, and board. Borrow, with attribution in the source file header:

- CCManager's per-agent output pattern detectors and idle debounce (src/services/stateDetector/claude.ts and codex.ts) for the tmux tail fallback.
- recon's approach to attaching to sessions started outside Mesa via tmux plus Claude Code's own session files.
- Happy Coder's `happy-agent` subcommand and `--json` shape as the template for `mesa --json` output.

NTM is not borrowed from until its license rider is reviewed.

## Evidence

docs/research/sources/alternatives.md, repository metadata and READMEs accessed 2026-09-24.

## Consequences

- Nothing is lost that a wrapper would have given: no tool offered the vault, receipts, Faro, profiles, or attention ranking anyway.
- Wrapping would have saved the tmux backend at most; the research estimate for that piece is small next to the coupling cost.
