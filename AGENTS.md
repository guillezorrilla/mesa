# Mesa

A macOS app plus a `mesa` CLI that runs many Claude Code and Codex sessions across many projects, shows them on one Session Board, keeps memory in an Obsidian vault, and routes recurring judgments through Faro, the decisions layer. Terms are defined in `CONTEXT.md`; use them as written. Decisions with evidence live in `docs/adr/`; read the ones that touch your area before changing it.

## Working here

- Every capability lands three times in one PR: a function in `packages/core`, a `mesa` subcommand with `--json`, and a screen or element in `apps/desktop`. Core holds the logic; the CLI and the app are thin callers.
- Dependencies are injected: core modules take them as parameters and `createMesa(profile, deps)` wires them; only the entrypoints (`packages/cli/src/mesa.ts`, `apps/desktop/src/main.tsx`) touch process globals or pick real implementations, and tests use the ones in `@mesa/core/testing`. See ADR-0008.
- This file is the only instruction file. Codex reads it natively and Claude Code reads it when no `CLAUDE.md` exists, so a `CLAUDE.md` must never be created.
- pnpm is the only package tool: `pnpm add`, `pnpm dlx`, `pnpm view`, `pnpm exec`. npm and npx are never used, in scripts, docs, or issues.
- Punctuation is ASCII: commas, periods, colons, or hyphens where an em dash would go. `pnpm check:dashes` fails CI on U+2014.
- The framework ships; the data stays home. Vault notes, receipts, profile configs, session records, and keys live under `~/.mesa/<profile>/` and in the user's vault, never in this repo or its fixtures. Test fixtures use invented content.
- Issues are half a day at most and one PR each, written with `.github/ISSUE_TEMPLATE/task.md`: observable acceptance criteria and an exact test plan. Before merge, run `/code-review` against the issue; the Spec axis checks every criterion. The merge gate is `pnpm verify` (lint, typecheck, test, build); it runs on every `git push` through the pre-push hook. GitHub Actions is not used: the workflow exists for manual runs only. Estimates are agent hours: size/S under 2, size/M under 4.
- A decision that is hard to reverse gets an ADR in `docs/adr/` with date and evidence. A new or ambiguous term gets a `CONTEXT.md` entry. A spike writes its outcome to `docs/spikes/`.
- Faro decisions, session events, and receipts carry probabilities and confidence; keep them in the receipt when you add a new decision site.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `guillezorrilla/mesa`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

`needs-triage`, `needs-info`, `ready` (the agent-ready label), `ready-for-human`, `wontfix`, plus `blocked`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
