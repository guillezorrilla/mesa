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
- WKWebView is the rendering engine: terminal rendering and clipboard behaviour need native checks, not Chromium assumptions. The P0 spike confirmed that the WebGL addon loaded; a later native check found its output could stay black (see the 2026-09-28 amendment).
- ADR-0002 remains as the record of the Electron evaluation.

## Amendment 2026-09-25: the embedded terminal as spiked (#8)

docs/spikes/embedded-terminal.md (SP-3, run live in the Tauri window) measured the stack above: portable-pty, events, xterm 6 with fit, and webgl in WKWebView. These changes apply to #28:

- Output events carry base64 strings, not byte arrays: JSON number arrays delivered a tenth of the bytes in a burst.
- `@xterm/addon-webgl` loads in WKWebView. `navigator.clipboard` and `execCommand('copy')` are refused there, so copy and paste go through Rust. tmux's `set-clipboard external` sends copies as OSC 52, and an OSC 52 handler in xterm writes them to the macOS pasteboard. That path was not built in the spike; #28 builds and checks it.
- The pane is sized explicitly, as Xirp does: after each fit, `resize-window -x <cols> -y <rows>`, then `set-option -w -u window-size`. This is because `-f ignore-size` has no effect when every attached client carries it (ADR-0001 amendment).
- The options that make the TUI usable in xterm follow Xirp's session defaults, less two (#28 review):
  - `mouse on` and `status off`, session options. Without `mouse on` the wheel sends arrow keys to the agent.
  - `set-clipboard external`, a server option and the default. Drag copies are also piped to `pbcopy` by a copy-mode binding, because Terminal.app ignores OSC 52.
  - Not `allow-passthrough`: it lets any pane output write the pasteboard.
  - No RGB `terminal-features`: Terminal.app shares `xterm-256color`. The app shows 256 colours until its pty gets its own TERM.
- The pty's output is held until the renderer's listeners exist (`term_ready`), because Tauri does not buffer events and tmux's first frame would be lost.
- The tmux-only alternative (`capture-pane -e` plus `send-keys`, no xterm) was measured at 7 ms a capture. It stays the board's last-output preview, because it cannot keep cursor, mouse, and scrollback fidelity.

## Amendment 2026-09-28: render live terminals without WebGL

In the packaged Mesa P4 Check app, a selected session's WKWebView pane stayed black while its tmux window accepted input and produced output. Removing `@xterm/addon-webgl` let xterm's default renderer show the same live output, including after switching between Board and Sessions. A command typed in the app printed `MESA-NATIVE-VISIBLE` in the selected pane. The default renderer is now the app's terminal path; the P0 result established addon loading, not reliable rendering after navigation.
