---
name: verifier-app
description: Verifies a change to the desktop app (apps/desktop) by driving the real App in headless Chromium against the worktree's built CLI under a throwaway profile. Use when verifying, screenshotting or live-checking an app screen, dialog or click flow.
---

# Verify an app change

The shell cannot click in the Tauri window, so the evidence comes from the real `App` on Vite: its bridge is an HTTP call to this worktree's built `mesa` CLI, its platform is `fakePlatform()`, and headless Chromium clicks through it. Every bridge call lands in `bridge.log` as `REAL` (the CLI ran) or `FAKE` (`harness/fakes.mjs` answered), which shows exactly what the UI sent. The harness is in [`harness/`](harness/).

## Steps

1. **Worktree at the change.** `git worktree add --detach ~/Developer/personal/mesa-<name> <commit>`, then in it `pnpm install --offline --frozen-lockfile` and `pnpm --filter @mesa/core --filter @mesa/cli build`. Done when `packages/cli/dist/mesa.js` exists.
2. **Throwaway profile and project.** With `MESA_PROFILE=<x>` and `MESA_SESSION_ID` unset: `node packages/cli/dist/mesa.js init --vault ~/mesa-<x>/vault --json`, then `git init` an invented folder `~/mesa-<x>/<project>` and `register ~/mesa-<x>/<project> --create --json`. Done when both envelopes say `"ok":true`. Keep everything under `~/mesa-<x>/`: discovery only maps folders below HOME, and `register` writes `mesa.yaml` into the folder.
3. **Harness.** Copy `harness/` to `apps/desktop/node_modules/.mesa-harness/` (git-ignored; bare imports resolve there). In its `fakes.mjs`, answer every command that would reach the network (tickets, sources, GitHub, Jira) with invented data. Run `MESA_HARNESS_PROFILE=<x> pnpm exec vite --config node_modules/.mesa-harness/vite.config.mjs` from `apps/desktop` in the background. Done when `http://localhost:1461/node_modules/.mesa-harness/index.html` answers 200.
4. **Drive.** `pnpm add playwright-core` in a scratch folder and launch the cached headless shell (`executablePath: ~/Library/Caches/ms-playwright/chromium_headless_shell-<n>/chrome-headless-shell-mac-arm64/chrome-headless-shell`; the WebKit download stalls). Click to the changed code, screenshot each state, and read `bridge.log` for the commands each click sent. Done when the changed code ran and every claim has a screenshot or a log line, plus at least one probe off the happy path.
5. **Clean up.** Stop Vite by the PID on port 1461 (`lsof -ti tcp:1461`), then delete `~/.mesa/<x>`, `~/mesa-<x>`, the harness folder, the worktree and the scratch folder. Done when `ls ~/.mesa` shows only the profiles that were there before.

## Gotchas

- A fresh profile opens on onboarding. Leave its Session hooks step alone: it writes the agents' real settings.
- `browser external` runs `/usr/bin/open`; `fakes.mjs` records it instead of opening a tab.
- Project tabs read `tickets`, `git` and so on in the DOM (CSS capitalises them); match text case-insensitively. Buttons inside menus (Settings, Unregister project) click most reliably through `page.evaluate`.
- A mouse pick in a cmdk list moves focus off its search box: type with `page.fill('[cmdk-input]', ...)`.
- Importing `@/lib/testing` logs React `act(...)` warnings in the console; they are harmless here.
- Not covered: the Rust side and the WKWebView itself (window chrome, native dialogs, how the web view treats links). Say so in the report when the change touches them.
