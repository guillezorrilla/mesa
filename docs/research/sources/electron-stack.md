# Electron Stack, Fact Verification

Prepared: 2026-09-24. Machine: macOS Darwin 25.6, Node 24.16, pnpm 11.5.
Method: `npm view` run locally against the live npm registry (marked **verified locally**), official docs fetched/searched (marked **verified official**), or third-party/community sources used only where no official source exists (marked **secondary, unverified**). No claim below is guessed; anything not confirmed is flagged as an open question.

---

## 1. Electron

**Current stable major**: `44`, exact latest is **44.4.5**.
Verified locally: `npm view electron version` → `44.4.5`; `npm view electron dist-tags` → `latest: 44.4.5`, `44-x-y: 44.4.5`, next alpha line `45.0.0-alpha.11` (tag `alpha`), beta line `44.0.0-beta.6` (superseded by stable 44), previous majors `43-x-y: 43.7.5`, `42-x-y: 42.11.8`, `41-x-y: 41.10.7`.

**Bundled Node/Chromium** (from releases.electronjs.org, accessed 2026-09-24, verified official):
- Electron 44.4.5 → Chromium 152.0.7977.130, Node.js 24.21.0
- Electron 43.7.5 → Chromium 150.0.7871.250, Node.js 24.21.0
- Electron 42.11.8 → Chromium 148.0.7778.280, Node.js 24.19.0

**Release cadence / supported majors**: verified official, electronjs.org/docs/latest/tutorial/electron-timelines (accessed 2026-09-24). Electron ships a new major every 8 weeks in step with Chromium's 4-week cycle (4 weeks alpha, 4 weeks beta, then stable). "The latest three stable major versions are supported by the Electron team", i.e., as of today that's 44, 43, 42. Electron majors track Chromium's even-numbered releases (example given in docs: Electron 26 ↔ Chromium 116, Electron 27 ↔ Chromium 118).

**`engines.node` on the npm package**: verified locally, `npm view electron engines` → `{"node": ">= 22.12.0"}`. This is the minimum Node needed on the *host* to install/build with the `electron` npm package; it is unrelated to the Node runtime bundled inside the Electron binary (24.21.0 above). Node 24.16 (this machine) satisfies it.

**Node ABI implications for native modules**: verified official, electronjs.org/docs/latest/tutorial/using-native-node-modules (via search summary, accessed 2026-09-24), Electron's runtime has a different ABI from a same-numbered Node.js release (e.g., BoringSSL vs OpenSSL, and a different V8 build), so any native (`.node`) addon must be recompiled against Electron's headers, not just Node's. Symptom: `NODE_MODULE_VERSION` mismatch error at require time. Fix: `@electron/rebuild` (verified locally on npm, current version **4.2.0**) recompiles native deps against the installed Electron version, or the addon ships prebuilt binaries for the exact Electron ABI (see node-pty section).

---

## 2. node-pty

**Current version**: verified locally, `npm view node-pty version` → **1.1.0** (stable/`latest` tag). `npm view node-pty dist-tags` → `latest: 1.1.0`, `beta: 1.2.0-beta.15`, plus legacy `conpty`/`alpha` tags. Last publish (any version): 2026-08-03 (verified locally, `time.modified`).

**Prebuilt binaries**: could not verify from the upstream `microsoft/node-pty` README that it ships prebuilds itself, the README (github.com/microsoft/node-pty, accessed 2026-09-24, verified official) shows only the usage example and does not mention `prebuild-install` or automatic Electron-ABI prebuilds; it lists Python + a C++ compiler as build dependencies, implying source builds via node-gyp by default. It states support for "Node.JS 16 or Electron 19" and platforms "Linux, macOS and Windows" (Windows via ConPTY on 1809+), but does not call out macOS arm64 explicitly in the fetched excerpt (open question, likely supported in practice since Electron itself ships darwin-arm64, but not confirmed in the README text captured).

**Electron rebuild requirement**: because node-pty is a native addon, using it inside Electron requires rebuilding it for Electron's ABI, typically via `@electron/rebuild` (4.2.0, verified locally) or an equivalent postinstall step, consistent with the general Node-ABI mismatch behavior in item 1. Not explicitly stated in node-pty's own README; inferred from Electron's official native-modules doc plus community sources (search results referencing `electron/rebuild`, accessed 2026-09-24, secondary/community corroboration).

**Known issues with Electron + pnpm**: secondary sources only (no single official doc). Web search (accessed 2026-09-24) surfaced:
- General pattern: native deps like node-pty need a rebuild step per package manager/runtime combination; pnpm's stricter (non-flat, symlinked) `node_modules` layout is called out in `pnpm/pnpm` issue #3415 ("pnpm symlinks with electron") as a source of friction for native-module resolution.
- Separately, **electron-builder** (not node-pty itself) has an open, actively-discussed bug in its v26 module collector: when packaging a pnpm monorepo, electron-builder can fail to detect the pnpm lockfile/tree structure (e.g., after `pnpm deploy`) and falls back to an npm-style flat collector, producing an ASAR missing nested `node_modules` (`Cannot find module '...'` at runtime). Referenced GitHub issues: electron-userland/electron-builder #8982, #8986/#9654 (per search summaries), #9445, #6933. Community workaround cited: pin electron-builder to 25.1.8, or verify against the current `26.16.1` line (`v26` dist-tag, verified locally via `npm view electron-builder dist-tags`) which may include fixes, **open question**, not independently confirmed against the actual changelog.
- **Status**: treat "does pnpm + electron-builder + node-pty package cleanly" as an unverified risk to prototype early, not a settled fact.

**spawn API**: verified official (node-pty README, github.com/microsoft/node-pty, accessed 2026-09-24). Signature matches the plan's assumption: `pty.spawn(file, args, options)` where `options` includes `name`, `cols`, `rows`, `cwd`, `env` (example shown: `spawn(shell, [], {name: 'xterm-color', cols: 80, rows: 30, cwd: process.env.HOME, env: process.env})`). Instance methods confirmed in the example: `onData(callback)`, `.write(data)`, `.resize(cols, rows)`. `.kill()` is part of the `IPty` TypeScript interface referenced by the README ("full API ... contained within the TypeScript declaration file") but was not shown in the fetched example snippet itself, treat as verified-by-strong-inference rather than directly read.

**Alternatives, `@homebridge/node-pty-prebuilt-multiarch` vs `@lydell/node-pty`**:
- `@homebridge/node-pty-prebuilt-multiarch`: verified locally, current version **0.14.1**, last publish 2026-09-01. Per its GitHub description (github.com/homebridge/node-pty-prebuilt-multiarch, accessed 2026-09-24, verified official for the repo's own claims): a parallel fork of node-pty's source that ships prebuilt binaries for ia32/amd64/arm/aarch64 across macOS, Windows, and Linux (glibc and musl), with an install-time script that fetches the matching prebuild instead of compiling.
- `@lydell/node-pty`: verified locally, current version **1.2.0-beta.15** (tracks upstream node-pty's own beta line 1:1), last publish 2026-08-08. Per its npm page (accessed 2026-09-24, secondary source): a thin wrapper around per-platform packages installed via npm `optionalDependencies`, so only the binary for the current platform is fetched; never invokes node-gyp; only supports platforms it has published prebuilds for.
- **Comparison**: both are actively maintained as of today (publishes within the last ~7 weeks). Homebridge's fork uses independent versioning (0.14.x) not tied to upstream node-pty releases; `@lydell/node-pty`'s version numbers mirror upstream 1.x/1.2.0-beta.x directly, suggesting tighter tracking of upstream node-pty changes/fixes. Neither claim of "better maintained" could be fully adjudicated from official sources alone, this is a **judgment call, not a verified fact**: `@lydell/node-pty` looks preferable if staying current with upstream node-pty matters most (zero node-gyp, minimal install footprint, version parity); the homebridge fork has a longer track record specifically inside Electron/multiarch packaging contexts (originally built for Homebridge's own Electron-adjacent tooling). **Open question**: neither was tested against Electron 44 + pnpm 11 + macOS arm64 in this pass.

---

## 3. xterm.js

**Package names/versions** (all verified locally via `npm view <pkg> version`, accessed 2026-09-24):
- `@xterm/xterm`: **6.0.0**
- `@xterm/addon-fit`: **0.11.0**
- `@xterm/addon-attach`: **0.12.0**
- `@xterm/addon-webgl`: **0.19.0**

Note: `@xterm/xterm` 6.0.0 is a fresh major (previous stable was 5.5.0, per community PR references, accessed 2026-09-24, secondary source) with documented breaking changes: Alt-key-as-Ctrl mapping behavior changed (must be re-added in app code if wanted), `ITerminalOptions.overviewRulerWidth` moved under `ITerminalOptions.overviewRuler`, and a rewritten viewport/scrollbar (ported from VS Code's base/platform code). New in 6.0.0: synchronized-output support (DEC mode 2026), a progress-addon, and WebGL renderer support for shadow DOM. Source: GitHub release notes summary via search (xtermjs/xterm.js releases, accessed 2026-09-24), **not independently read from the raw changelog file**, treat version-to-version breaking-change list as secondary-source-confirmed, not primary-text-confirmed.

**Electron main↔renderer bridging pattern**: verified official for the mechanism (electronjs.org/docs/latest/tutorial/tutorial-preload and .../api/context-bridge, accessed 2026-09-24): with context isolation on (Electron's default/required posture), the preload script uses `contextBridge.exposeInMainWorld` to publish a narrow API (e.g., `window.mesa.ptyWrite(data)`, `window.mesa.onPtyData(cb)`) backed by `ipcRenderer.invoke`/`ipcRenderer.on`, while the actual `node-pty` process lives in the Electron **main** process (main has full Node access; renderer does not, by design, when `nodeIntegration: false` + `contextIsolation: true`, the recommended secure default per Electron's docs). Data flows: renderer keystrokes → IPC → main → `pty.write()`; `pty.onData()` in main → IPC → renderer → `xterm.write()`. This is a well-established community pattern (opcito.com blog and others, accessed 2026-09-24, secondary source for the specific worked example) built on official Electron IPC APIs.

**Attaching to an existing tmux window**: could not verify from an official source, this is an application-level design choice, not documented by node-pty, xterm.js, or tmux's own docs as a "pattern." Standard approach per the plan's own description: `pty.spawn('tmux', ['new-session', '-A', '-s', sessionName, '-t', windowTarget], {...})` (the `-A` flag makes `tmux new-session` attach to an existing session of that name if present, otherwise create it, this is tmux's own documented behavior, not independently re-verified against the tmux man page in this pass, **open question**) or `tmux attach-session -t <session>:<window>` if the session is already guaranteed to exist. Resize propagation: call `pty.resize(cols, rows)` on the node-pty instance whenever xterm.js's `FitAddon` recomputes dimensions (via `@xterm/addon-fit`, confirmed above) or on a container resize observer; node-pty forwards this to the underlying PTY's `TIOCSWINSZ` (or ConPTY resize on Windows), which tmux will pick up as a client resize and reflow the attached window, this mechanism is standard PTY behavior, not something specific to node-pty documented explicitly in the fetched README excerpt.

**Known tmux-inside-xterm.js gotchas** (secondary sources, accessed 2026-09-24, no single official doc covers this combination):
- **TERM**: tmux expects `TERM` to be `screen`, `tmux`, or a variant like `tmux-256color` *inside* the tmux session; `TERM` *outside* also needs to support 256 colors for tmux to pass color through correctly. If xterm.js's own PTY is spawned with a `TERM` that isn't 256-color-capable, colors inside tmux can look wrong. Community fix pattern: `set -g default-terminal "tmux-256color"` in `tmux.conf`, and ensure the outer PTY spawn sets `TERM=xterm-256color` (xterm.js's own terminfo family).
- **Alternate screen**: some setups explicitly disable tmux's alternate-screen mode (`set-window-option -g alternate-screen off`) to avoid interaction issues with the outer terminal's own alt-screen handling; whether this is needed depends on how the app manages xterm.js's own alt-buffer usage, flagged as an open question requiring hands-on testing, not a universal requirement.
- **Mouse mode / clipboard**: a documented friction point is OSC 52 clipboard integration, tmux's copy-mode can send an OSC 52 sequence when copying to its internal buffer, node-pty passes it through, and xterm.js receives it, but browsers require a direct user gesture (click/tap) to act on clipboard writes, which can block "copy in tmux, paste in host app" workflows. This is a real, documented interaction (search source, accessed 2026-09-24) worth designing around (e.g., app-level clipboard bridging) rather than relying on OSC 52 alone.
- 256-color support in tmux generally required explicit `default-terminal` configuration historically (tmux/tmux GitHub issue #120, accessed 2026-09-24, verified official/primary, this is tmux's own repo), still relevant to check against whatever tmux version ships on the dev machine.

---

## 4. Scaffolding: electron-vite vs Electron Forge vs electron-builder

**Current versions** (all verified locally via `npm view <pkg> version`, accessed 2026-09-24):
- `electron-vite`: **5.0.0**
- `@electron-forge/cli`: **7.11.2**
- `electron-builder`: **26.15.3** (`latest` dist-tag; a separate `v26` tag points to 26.16.1, and `next`/alpha is 27.0.0-alpha.8, verified locally via `npm view electron-builder dist-tags`)

**Framing**: electron-vite and Electron Forge are not directly competing with electron-builder, electron-vite and Forge are *build/dev tooling* (dev server, HMR, bundling main/preload/renderer), while electron-builder is a *packaging/distribution* tool (installers, code signing, auto-update feeds, notarization hooks). Forge actually bundles its own packaging step (using `@electron/packager` plus optional makers), so the real three-way choice is: (a) electron-vite for dev/build + electron-builder for packaging, (b) Electron Forge end-to-end (dev, build, package, publish, using its own Vite plugin for bundling), or (c) hand-rolled Vite + electron-builder.

**"Boring default" for a pnpm monorepo, React, TypeScript in 2026**: secondary sources only (community write-ups, GitHub template repos, and blog posts, accessed 2026-09-24), no single official Electron doc picks a winner. Recurring pattern across the templates found (`beixiyo/electron-starter`, `buqiyuan/electron-vite-monorepo`, `flaviodelgrosso/electron-forge-react-vite-boilerplate`): **electron-vite + electron-builder is the more commonly seen pairing** for React+TS+pnpm setups, valued for fast Vite-native dev/HMR and minimal config; Electron Forge is described as more "battle-tested" for production packaging once configured, at the cost of more manual setup for React/TS/Tailwind. One community source explicitly flags an **electron-builder v26 pnpm-monorepo packaging bug** (see item 2) as a live risk for exactly this stack, reinforcing that the "standard pair" claim should be validated with a throwaway pnpm-workspace build before committing.

**Verdict for this plan**: electron-vite + electron-builder is a reasonable, common default, but is **not confirmed as an official or unanimous "standard pair"**, it is the most frequently occurring combination in current (2026) community templates, with a known open packaging risk under pnpm workspaces that should be smoke-tested early.

---

## 5. macOS signing and distribution

**Developer ID signing, hardened runtime, notarization**: verified official, electronjs.org/docs/latest/tutorial/code-signing (accessed 2026-09-24). Electron's docs state plainly that "both Windows and macOS prevent users from running unsigned applications," and describe a two-step macOS flow: code signing, then notarization ("the app needs to be uploaded to Apple for a process called notarization, where automated systems will further verify that your app isn't doing anything to endanger its users"). Prerequisites per the doc: enrollment in the Apple Developer Program, Xcode installed, and signing certificates. The doc does **not** name `notarytool` explicitly in the fetched excerpt, but does confirm Electron Forge uses `@electron/notarize` under the hood for this step.

**notarytool**: verified official via Apple's own release/deprecation notices (developer.apple.com/news and TN3147 "Migrating to the latest notarization tool," accessed 2026-09-24): Apple's notary service stopped accepting uploads from the older `altool` (and Xcode 13 or earlier) **starting November 1, 2023**; `notarytool` (bundled with Xcode 14+) is the current required tool. Already-notarized software already shipped is unaffected; only *new* submissions via the old path are blocked. This is a hard requirement for any 2026 build pipeline.

**Entitlements for an app spawning child processes and loading native modules**: verified official/primary for the mechanism (developer.apple.com "Hardened Runtime," accessed 2026-09-24) plus electron-builder's own shipped template (github.com/electron-userland/electron-builder, `packages/app-builder-lib/templates/entitlements.mac.plist`, accessed 2026-09-24 via search, verified as the actual template file in electron-builder's repo):
- `com.apple.security.cs.allow-jit`, allows V8 to mark memory executable for JIT-compiled JS. Needed because Electron embeds V8.
- `com.apple.security.cs.allow-unsigned-executable-memory`, allows executing dynamically generated, unsigned code pages; used historically for V8/Electron. Flagged in a secondary source (accessed 2026-09-24) as increasingly disfavored: it can trip notarization/App Store security review, with guidance to prefer `allow-jit` alone where possible, **worth re-checking against the current electron-builder default template contents directly before finalizing entitlements**, since this recommendation was not itself an Apple statement.
- `com.apple.security.cs.disable-library-validation`, allows loading dylibs/native Node addons not signed with the same Team ID as the app, which is exactly the case for third-party native modules like node-pty. Required for this app's native-module use.
- electron-builder ships all three as `true` in its default `entitlements.mac.plist` template (per search summary of the actual template file, accessed 2026-09-24).

**Unsigned local builds for personal use**: not explicitly confirmed by Electron's docs in the fetched excerpt (the page describes Gatekeeper warnings and "multiple advanced and manual steps" for users to run unsigned apps, but doesn't say this in the specific context of "same machine that built it"). This is well-established general macOS behavior (Gatekeeper quarantine + right-click-Open / `xattr -d com.apple.quarantine` bypass) rather than an Electron-specific fact, **treat as generally true from broad macOS knowledge, but not pinned to an official citation in this pass**; flagged as an open question for a follow-up fetch of Apple's Gatekeeper docs specifically.

---

## 6. macOS TCC permissions

**Full Disk Access**: partially verified official (support.apple.com/guide/security "Controlling app access to files," accessed 2026-09-24). The page confirms macOS 10.15+ requires user consent for **Desktop, Documents, Downloads, iCloud Drive, and network volumes**, and that broader access needs the app added to Full Disk Access in System Settings. The page, as fetched, does **not** explicitly state whether arbitrary subfolders under the home directory (e.g., `~/.claude`, `~/.codex`, `~/.mesa`) are exempt from these protections. Based on the specific, named protected categories (Desktop/Documents/Downloads/iCloud/network/removable/Time Machine volumes), a plain home-directory dotfolder like `~/.claude` or `~/.codex` is **not** one of the listed protected categories, so ordinary read/write there should not require Full Disk Access or trigger a TCC prompt, **this is an inference from the categories Apple lists, not a directly confirmed statement**, and should be validated empirically (spawn a clean, unsigned build and touch `~/.mesa` and `~/.codex` without granting any permission).
  - A user-chosen Obsidian vault folder: if that folder sits inside one of the protected categories (e.g., under `~/Documents` or iCloud Drive), the *user's own folder-picker grant* (via `NSOpenPanel`, which macOS treats as implicit permission for the chosen path) is what authorizes access, this is standard macOS sandboxing/TCC behavior for user-selected files, not something requiring Full Disk Access as long as access goes through a picker dialog rather than a raw path guess. Not independently re-verified against an Apple doc section specific to `NSOpenPanel` grants in this pass, **open question**.

**Accessibility**: not verified against an Apple doc in this pass (no fetch performed specifically on Accessibility permission semantics). Based on well-known macOS API contracts, Accessibility (`AXIsProcessTrusted`) is required only for **synthesizing input into other applications** (e.g., posting keyboard/mouse events via the Accessibility/CGEvent APIs) or reading UI element state from other apps, it is **not** required merely to spawn child processes, run a shell, or run tmux. Since this app's described behavior (spawn tmux/shells, read/write files) does not synthesize input into other apps, Accessibility should not be needed, **flagged as inferred from general API knowledge, not confirmed by an Apple citation fetched in this session**.

**Automation (Apple Events)**: verified official, developer.apple.com/documentation/bundleresources/information-property-list/nsappleeventsusagedescription (accessed 2026-09-24). `NSAppleEventsUsageDescription` governs sending Apple Events to *other applications* (AppleScript via `NSAppleScript`, Scripting Bridge, or direct Apple Event APIs), it explicitly does **not** apply to `posix_spawn`/`fork`/`exec`/`NSTask`-style child process spawning. Since spawning tmux/shells via node-pty is plain process spawning (not Apple Events), this app should **not** need the Automation/Apple Events TCC category or `NSAppleEventsUsageDescription`, unless a future feature specifically drives another app via AppleScript.

**Summary answer to the six-part question**:
| Resource | TCC category needed? | Basis |
|---|---|---|
| Spawn tmux/shells | None (no Automation, no Accessibility) | NSAppleEventsUsageDescription doc explicitly excludes process spawning (verified official) |
| Read `~/.claude`, `~/.codex` (home dotfolders) | Likely none | Not in Apple's listed protected-folder categories (inferred, not directly confirmed) |
| Obsidian vault folder (user-chosen) | None beyond the picker grant, if selected via `NSOpenPanel`; Full Disk Access only if accessed via a raw path outside a picker and inside a protected category | Standard macOS user-selected-file TCC model (inferred, not directly confirmed) |
| Write `~/.mesa` | Likely none (plain home subfolder) | Same reasoning as above |
| Desktop / Documents / Downloads / iCloud (if accessed directly, not via picker) | Full Disk Access or per-folder consent | Verified official (support.apple.com/guide/security) |
| Synthesizing input into other apps | Accessibility | Inferred from general API knowledge, not fetched this session |

---

## 7. Alternatives to Electron: Tauri 2

One paragraph, evidence-based. Tauri 2 is viable as an Electron alternative for a PTY-driven terminal app: a dedicated community plugin, `tauri-plugin-pty` (github.com/Tnze/tauri-plugin-pty, also published on crates.io/lib.rs, accessed 2026-09-24, secondary source), wraps PTY handling in Rust (using the `portable-pty` crate for cross-platform PTY/ConPTY abstraction per another search result) and pairs with xterm.js in the webview exactly like the node-pty pattern in Electron, one real-world example found, "Pide" (github.com/pirayan20/pide), is described as a Tauri 2 + Rust + React terminal/dev workspace combining a native PTY backend with xterm.js/WebGL rendering, and a second, "TmarTerminal," pairs Tauri 2 + React + xterm.js + a Rust backend for an SSH terminal. This is not a first-party Tauri PTY solution (no equivalent of node-pty ships with Tauri core; it's a third-party plugin at v0.1.x per crates.io, i.e., early and unproven at scale), whereas node-pty is a decade-plus-old, Microsoft-maintained module with wide adoption (VS Code's own integrated terminal) and, per item 2 above, multiple actively-maintained prebuilt forks. Given the team is described as "a TypeScript-writing agent", i.e., the automation building/maintaining this app writes TS, not Rust, Electron's Node-native stack (main process using node-pty directly, no FFI/plugin boundary to a Rust crate, no second language runtime to keep an agent proficient in) is the lower-friction choice for an agent-maintained codebase, even though Tauri would likely yield a smaller binary and lighter memory footprint. The plan's Electron choice holds on these grounds, with the tradeoff being binary size/memory versus implementation-language uniformity for the agent doing the building.

---

## Verification status summary

| # | Item | Status |
|---|---|---|
| 1 | Electron version/Node/Chromium/cadence/ABI | Verified locally (npm view) + verified official (electronjs.org, releases.electronjs.org) |
| 2 | node-pty API/versions/forks | Verified locally (npm view) + verified official (node-pty README) + secondary for pnpm/Electron-builder issues |
| 3 | xterm.js versions/IPC/tmux | Verified locally (npm view) + verified official (Electron IPC docs) + secondary for tmux gotchas and xterm 6.0.0 changelog details |
| 4 | Scaffolding tooling | Verified locally (npm view) + secondary/community for "boring default" claim (no official arbiter exists) |
| 5 | macOS signing/notarization/entitlements | Verified official (Electron docs, Apple TN3147, Apple Hardened Runtime docs, electron-builder template) |
| 6 | TCC permissions | Verified official for Automation/Apple Events; partially verified / inferred for Full Disk Access scope and Accessibility (not independently fetched) |
| 7 | Tauri 2 alternative | Secondary sources only (community plugin, example repos); no official Tauri PTY doc fetched |

**blocked_on**: null (file written; no hard blocker hit). Open items needing a follow-up pass if higher confidence is required: (a) direct Apple doc confirming home-dotfolder exemption from Full Disk Access, (b) direct Apple doc on Accessibility permission scope, (c) direct read of electron-builder's current `entitlements.mac.plist` file contents and its v26.16.1 pnpm-monorepo bug status, (d) direct read of xterm.js 6.0.0's raw CHANGELOG.
