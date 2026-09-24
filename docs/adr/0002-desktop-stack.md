# ADR-0002: Desktop stack is Electron 44, electron-vite, React, node-pty, xterm 6

Status: accepted
Date: 2026-09-24

## Context

The app is built by a TypeScript-writing agent and must embed a terminal per session (see CONTEXT.md, Board). The proposal named Electron plus React, node-pty, and xterm.js without versions.

## Decision

- Electron 44 (44.4.5 at decision time, bundled Node 24.21, Chromium 152). Track the latest supported major; Electron supports the latest three.
- electron-vite 5 for main, preload, and renderer builds. electron-builder 26 for packaging in P7, with the pnpm monorepo ASAR issue (electron-builder issues 8982, 8986, 9654) checked by a smoke test before P7 starts.
- node-pty 1.1 in the main process, rebuilt for the Electron ABI with @electron/rebuild 4. Upstream ships no prebuilds. If the rebuild is fragile on CI, switch to @homebridge/node-pty-prebuilt-multiarch (0.14.1, published 2026-09-01) in a follow-up ADR.
- @xterm/xterm 6.0 with addon-fit and addon-webgl. Version 6 is a fresh major with breaking changes to Alt key mapping and the viewport, so no 5.x examples are copied blindly.
- Renderer to main over contextBridge and ipcRenderer.invoke; node-pty never runs in the renderer.
- Tauri 2 rejected for v1: a Rust core adds a second language and an FFI seam, and its pty story (tauri-plugin-pty 0.1.x) is early.

## Evidence

docs/research/sources/electron-stack.md, accessed 2026-09-24. Versions captured with npm view. Signing and TCC facts from Electron docs, Apple TN3147, and Apple Hardened Runtime docs.

## Consequences

- No macOS TCC permission is needed for spawning tmux and shells or for reading ~/.claude, ~/.codex, and ~/.mesa. If a user places a vault under Desktop, Documents, Downloads, or iCloud, macOS shows its standard folder prompt once.
- Unsigned local builds are fine for personal use. Developer ID signing, hardened runtime with the electron-builder default entitlements, and notarytool are P7 work.
