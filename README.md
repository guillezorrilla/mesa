# Mesa

One screen for every Claude Code and Codex session across your projects, with memory in an Obsidian vault and a decisions layer (Faro) for the judgments the system makes all day.

- `AGENTS.md`: how to work in this repo (the only instruction file).
- `CONTEXT.md`: the glossary. Use its terms.
- `docs/adr/`: decisions with evidence. `docs/research/verification.md`: what was checked before building.
- Issues: GitHub, milestones P0 to P7, one PR per issue.

## Layout

`packages/core` holds all logic, `packages/cli` is the `mesa` command with `--json` on everything, `apps/desktop` is a Tauri 2 shell that calls the CLI. See ADR-0007.

## Run locally

Requires Node 24, pnpm 11, Rust stable, tmux, and at least one of `claude` or `codex` on PATH.

```sh
pnpm install
pnpm build
pnpm mesa --version
pnpm test
pnpm -C apps/desktop tauri dev
```
