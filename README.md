# Mesa

One screen for every Claude Code and Codex session across your projects, with memory in an Obsidian vault and a decisions layer (Faro) for the judgments the system makes all day.

- `AGENTS.md`: how to work in this repo (the only instruction file).
- `CONTEXT.md`: the glossary. Use its terms.
- `docs/adr/`: decisions with evidence. `docs/research/verification.md`: what was checked before building.
- Issues: GitHub, milestones P0 to P7, one PR per issue.

## Layout

`packages/core` holds all logic, `packages/cli` is the `mesa` command with `--json` on everything, `apps/desktop` is a Tauri 2 shell that calls the CLI. See ADR-0007.

## Run locally

Requires Node 24, pnpm 11, Rust stable, tmux, and `claude` on PATH (`codex` is optional until P3).

```sh
pnpm install
pnpm build
pnpm dev:link
mesa --version
mesa doctor
```

`pnpm dev:link` writes a shim at `~/.local/bin/mesa` that runs this checkout's `packages/cli/dist/mesa.js` with the node you ran it with, so `~/.local/bin` must be on your PATH (add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile if `mesa` is not found). Re-run it if you move the checkout or switch node.

For development, after `pnpm install`, run:

```sh
pnpm dev
```

This builds core and CLI once, starts their compiler watcher, and launches the desktop app through Tauri/Vite. React and CSS edits hot-reload; core/CLI edits rebuild automatically and apply on the next app action (reload or reopen a view to rerun its read). Rust edits trigger Tauri's rebuild and app restart. Stop everything with Ctrl-C. Native notifications require a bundled `.app` and are unavailable in this unbundled dev launch. Use `MESA_PROFILE=<name> pnpm dev` to choose an existing profile.

`pnpm dev:cli` runs only the core/CLI watcher. `pnpm dev:desktop` starts only the desktop app against the current compiled CLI.

Other commands:

```sh
pnpm test                       # vitest
pnpm verify                     # lint, typecheck, test, build (also the pre-push hook)
pnpm -C apps/desktop tauri dev  # the desktop app
```
