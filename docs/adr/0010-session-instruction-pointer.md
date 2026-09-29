# ADR-0010: A session-start hook supplies a bounded Mesa pointer

Status: accepted
Date: 2026-09-28

## Context

Mesa gives a provider a goal and a native working directory, but a provider started in a worktree or resumed from its own conversation may not know its Mesa session ID, profile, or coordination commands. A repository instruction file is the wrong owner: it would modify user instructions and would not apply to General sessions. A symlinked skill makes documentation discoverable but does not prove the agent reads it. P4 needs an additive instruction that keeps native permissions and the goal intact.

## Decision

- The existing Claude Code and Codex `SessionStart` hooks are the only supplemental instruction channel. `mesa hook <agent>` records the native event as before and prints a short pointer only when the hook's native session ID matches a live Mesa record in `MESA_SESSION_ID`. Other hook events are silent. The common session launch owner supplies the same session/profile environment to fresh, worktree, resumed, handoff, and queued launches.
- The pointer identifies the profile, session, project, and cwd, and reminds the agent that its saved goal is already in the startup prompt. It directs the agent to generated `mesa help --agent` and the effective skills list; names start, queue, send, and handoff commands; and distinguishes human waits, guardrail blocks, meaningful decisions, and vault changes from routine operational events. Skills are invoked in the native terminal. The pointer says connected vault discovery is unavailable until P5.
- `mesa show --json` and the selected-session app view report whether the current hook configuration is configured, missing, conflicting, or unsupported. This describes configuration, not proof that a provider consumed the pointer. Codex's native hook trust review remains required; Mesa never bypasses it. Antigravity has no qualified additive startup hook, so its status is unsupported.
- Mesa never creates or rewrites a repository `CLAUDE.md` or `AGENTS.md` to deliver this pointer. Record-only adoption of a process already outside Mesa cannot retrofit its startup context.

## Evidence

In an isolated invented profile with Codex CLI 0.157.1, a real fresh Codex session answered with the pointer's instruction to save meaningful decisions and vault changes, not routine events. A real worktree Codex session read an invented project skill, named its invented shore, called `mesa sessions --json`, and reported its own Mesa ID. The native hook log shows `SessionStart`, `UserPromptSubmit`, and `Stop`, and Codex's hook status shows seven installed and trusted entries after the user completed the native trust prompts. These observations establish fresh and worktree Codex consumption, not all provider/lifecycle paths. The full matrix and observed limits belong in the #253 qualification record.

## Consequences

The pointer stays small and is generated from the session record at startup, so it cannot silently change the saved goal or provider trust. A missing, stale, or untrusted hook is visible in JSON and the app. Provider-native resume and clear/compact must be checked separately because a configured hook alone is insufficient evidence of repeated delivery.
