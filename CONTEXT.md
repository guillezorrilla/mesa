# Mesa glossary

Shared vocabulary for issues, code, receipts, and screens. Use these terms as written. Each entry names the synonyms to avoid so the same thing is never called two names.

## Profile

A named configuration under `~/.mesa/<name>/`: `config.yaml` (`vault` path, `defaultAgent`, enabled `skills`, `decisions.backend` and `decisions.threshold` (the confidence below which the rules backend defers to the adapter, ADR-0003), `sessions.log` (continuous output logging for sessions), and `keys` (literals or `env:VAR` references, always printed as `***`)), `registry.yaml`, and `sessions/`. `mesa init` creates it; `mesa config` reads and edits it. Exactly one vault per profile. `default` is created on first run; `mesa --profile work` or `MESA_PROFILE=work` selects another. Work and personal are two profiles, never one shared vault.
Not: workspace, account, environment.

## Vault

The Obsidian vault a profile owns. Layout: `raw/` (immutable inputs), `wiki/` (agent-written knowledge), `projects/`, `receipts/`, `daily/`, `AGENTS.md` (the vault's own schema), `index.md`, and an append-only `log.md`. Mesa writes files; Obsidian renders them. Vault content never enters this repo.
Not: notes folder, knowledge base, memory (memory is what the vault holds, not the vault).

## Project

A repository registered with a profile through its `mesa.yaml` (name, preferred agent, tmux layout, extra skills). A project has zero or more sessions.
Not: repo (a repo becomes a project once registered), workspace.

## Registry

The list of registered `mesa.yaml` paths in a profile. `mesa projects` reads it; `mesa register <path>` appends to it.
Not: project list, index.

## Agent

The CLI coding agent a session runs: `claude` (Claude Code) or `codex` (Codex CLI). v1 ships `claude` only; `codex` is added in P3 (ADR-0003 amendment).
Not: model, assistant, bot.

## Session

One agent process for one project, running or resumable. Fields: Mesa session id, agent, project, agent session id (Claude Code session UUID or Codex thread id), start time, last state, last output tail. Backed by one tmux window. Persisted as `~/.mesa/<profile>/sessions/<id>.json`.
Not: task, run, job, thread (thread is Codex's word for its own id).

## Session state

Where a session is right now, one of: `working`, `waiting-permission`, `waiting-question`, `idle`, `done`, `failed`. Faro classifies it from hook signals and the output tail and attaches a confidence. `waiting-permission` and `waiting-question` are the states that need a human.
Not: status, phase, mode.

## Attention score

A number from 0 to 1 per session: how urgently the user is needed. Faro computes it from state, time in state, and project priority. The board sorts by it, highest first.
Not: priority, urgency, rank.

## Board

The Session Board: the first screen of the app and the output of `mesa sessions`. Every session across every project with agent, state and confidence, last output, running time, and attention score. Actions: open, stop, send, terminal, resume.
Not: dashboard, overview, list.

## Skill

A folder with a `SKILL.md` that either agent can load. Repo skills live in `.claude/skills/` (Claude Code) and `.agents/skills/` (Codex). Skills Mesa ships live in `skills/` and are installed into a profile's enabled set.
Not: plugin, command, tool, prompt.

## Receipt

A markdown file with YAML frontmatter written to the vault's `receipts/` after every skill run, session, and decision. The frontmatter schema is a P1 deliverable (`docs/receipts.md`). Receipts are the audit trail; the `log.md` line points at the receipt.
Not: log entry, record, artifact.

## Decision

One call to Faro: `decide(state, questions)` returning one answer per question with a probability distribution and a confidence. Question primitives: `Choice` (pick one of N), `Score` (a number on a stated scale), and `Noul` (yes or no as one calibrated probability). Fixed in ADR-0004. Every decision is written to a receipt with its probabilities.
Not: judgment, classification, inference, prediction.

## Faro

The decisions layer, `packages/core/src/decisions`. Used for session state, attention score, guardrail checks before external actions (send, push, delete), vault ingest routing, and free-text request routing.
Not: the AI, the brain, the classifier.

## Backend

A swappable implementation behind an interface. Two kinds, always qualified: the **decisions backend** (`rules`, `adapter`, `jev`) and the **session backend** (`tmux`). Say which one.
Not: provider, driver, engine.

## Guardrail

A decision Faro makes before an external action (send a prompt, push, delete): allow, ask, or block, with confidence. Recorded in the action's receipt.
Not: safety check, policy, filter.
