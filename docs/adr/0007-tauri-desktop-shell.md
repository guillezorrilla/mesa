# ADR-0007: The desktop app is a Tauri 2 shell over the mesa CLI

Status: accepted, supersedes ADR-0002
Date: 2026-09-24

## Context

ADR-0002 chose Electron. The owner asked for a faster, Rust-based shell. Tauri 2 (Rust core, system WKWebView on macOS) is the mature option: binaries an order of magnitude smaller, lower memory, and no Node native module rebuilds. It removes the two risks ADR-0002 carried (node-pty rebuilds for the Electron ABI and the electron-builder pnpm monorepo packaging bug). It adds a second language and a Rust compile step.

## Decision

- `apps/desktop` is a Tauri 2.11 app: Rust core in `src-tauri/`, React 19 with Vite and TypeScript in the webview, managed with pnpm. Versions at decision time: @tauri-apps/cli 2.11.5, @tauri-apps/api 2.11.1, tauri crate 2.11.6, portable-pty 0.9.0.
- All logic stays in `packages/core` (TypeScript). The app reaches it through the `mesa` CLI: one Rust command `run_mesa(args)` spawns the CLI with `--json`, passes `MESA_PROFILE` through, and returns the parsed envelope from ADR-0001's sibling, the result envelope in P0-1. In development the CLI path is `packages/cli/dist/mesa.js` run with node; in a packaged app it is a Tauri sidecar built as a single executable (P7). This is the fixed decision "every capability is a core function, a `mesa` command, and a screen" taken literally: the screen calls the command.
- The embedded terminal is Rust: the `portable-pty` crate spawns `tmux -L mesa-<profile> attach-session -t <target> -f ignore-size` and streams bytes to the webview as Tauri events; `@xterm/xterm` 6 renders them. Commands: `term_open`, `term_write`, `term_resize`, `term_close`.
- Native dialogs use `@tauri-apps/plugin-dialog`. Process spawning happens only in Rust commands; the shell plugin is limited to opening URLs.
- Packaging: `tauri build` produces the `.app` and `.dmg`; signing, hardened runtime, and notarization are configured in `tauri.conf.json` (P7).
- CI: `dtolnay/rust-toolchain@stable` with `Swatinem/rust-cache`; `pnpm build` runs `vite build` plus `cargo check` for the desktop app. Full `tauri build` runs only in the release workflow.
- ponytail: the per-call Node start-up of `run_mesa` (about 50 to 100 ms) is accepted for a board that polls every 2 seconds. Upgrade path when it hurts: `mesa serve` over a Unix socket speaking JSON lines, same envelope.

## Evidence

Owner request on 2026-09-24. Versions from `pnpm view` and crates.io on 2026-09-24. docs/research/sources/electron-stack.md item 7 for the Tauri assessment; docs/research/sources/tmux-vs-node-pty.md for the attach commands.

## Consequences

- No node-pty, no electron-rebuild, no electron-builder.
- Rust is a toolchain requirement for contributors and CI; cold `cargo` builds take minutes and are cached.
- WKWebView is the rendering engine: the xterm WebGL addon and clipboard behaviour are verified in the P0 terminal spike, not assumed from Chromium.
- ADR-0002 remains as the record of the Electron evaluation.
