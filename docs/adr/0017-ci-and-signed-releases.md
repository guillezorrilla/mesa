# ADR-0017: CI on GitHub Actions, one version, and signed releases with the CLI inside the app

Status: accepted
Date: 2026-10-02

## Context

#431. The repo went public (#430), so GitHub Actions on macOS is free and the `verify` check can gate `main`. A release has to be a real install: a signed, notarised DMG that Gatekeeper opens without a warning, an update archive for the updater (#429), and a `mesa` command that works without a Node install or this repo. Until now the app ran `node packages/cli/dist/mesa.js` from the workspace it was built in (`bridge.rs`). The Rust crate depends on `objc2`, so nothing builds on Linux.

## Decision

**CI.** `.github/workflows/ci.yml` has one job, `verify`, on `macos-latest`, which runs `pnpm verify` for every pull request and push to `main` with no path filters. It is the required check in protect.sh's `main` ruleset. Every action is pinned to a full commit SHA, and Dependabot updates the pins weekly. `verify.sh` builds before it typechecks and tests, because the bridge test and the typecheck read the built CLI and core.

**One version.** `apps/desktop/package.json` holds it, and `tauri.conf.json` reads it from there (`"version": "../package.json"`). `scripts/release/version.sh X.Y.Z[-beta.N]` writes it into every `package.json`, `Cargo.toml` and `Cargo.lock`. `--check` (run as `pnpm check:version`, a step of `pnpm verify`) fails on any drift. `vX.Y.Z` is a stable release and `vX.Y.Z-beta.N` a beta prerelease. `CFBundleVersion` is `git rev-list --count HEAD`, which only grows because `main` keeps a linear history.

**The CLI inside the app.** esbuild bundles the CLI into one ESM file. Node 26's `--build-sea` turns it into a single executable application, built from pinned and checksummed nodejs.org binaries. The SEA config's `executable` field builds the x64 slice on an arm64 Mac, and `lipo` joins the two slices. Tauri's `externalBin` stages the result as `Contents/MacOS/mesa`, and release builds of the app run that copy (debug builds still run the workspace's node). Inside the executable (`node:sea`'s `isSea()`):

- the version and the vault template are assets;
- `self` is `[process.execPath]`;
- the skill library is assets, unpacked to `~/.mesa/.skills/` and rewritten whole when the version changes. Projects symlink into the library, so it must be a real folder at a fixed path.

**Signing.** There is one universal build (`tauri build --target universal-apple-darwin`) with the hardened runtime. `Entitlements.plist` grants V8's `allow-jit` and `allow-unsigned-executable-memory` and nothing else: no `get-task-allow`, no sandbox. Tauri signs both executables with a Developer ID Application certificate and notarises and staples the app. `sign.sh` then signs, notarises (`notarytool` with an App Store Connect API key, not an Apple ID password) and staples the DMG. The build fails unless `spctl`, `stapler validate` and the entitlement checks pass. The release-only config (`externalBin`, update archives, the updater public key) is in `tauri.release.conf.json`, so `cargo test` and `tauri dev` need no sidecar or keys.

**Release.** `scripts/release/{version,build,sign,publish}.sh` behind `pnpm release:*` are the only release steps, run the same by a person and by `.github/workflows/release.yml`. Locally, `env.sh` fills unset variables from the login Keychain (service `mesa-release`), else from a gitignored `.env.release.local`. In CI they come from the `release` environment, which only the owner approves and which deploys only from `v*` tags. Only the owner can push a `v*` tag. The workflow reuses `ci.yml`, imports the certificate into a temporary keychain that an `always()` step deletes, and attests build provenance for the DMG and the update archive. It publishes with the owner's fine-grained token (`RELEASE_TOKEN`, Contents on this repo only): GitHub allows a release on a protected tag only for an actor that may create the tag, and a personal repo's ruleset cannot list GitHub Actions as a bypass actor (tried 2026-10-02: HTTP 422). A beta also replaces `latest.json` on the fixed prerelease `beta`, the beta channel's feed for #429.

There is no Homebrew cask (the owner, 2026-10-02): the DMG is the one way to install, and the in-app updater (#429) reading `latest.json` is the way to update. A terminal reaches the CLI through a link to `Contents/MacOS/mesa`.

## Evidence

On 2026-10-02 an ad-hoc build (`APPLE_SIGNING_IDENTITY=- pnpm release:build`) on the owner's arm64 Mac produced a 99 MB universal DMG. `mesa --version` and `arch -x86_64 mesa --version` from the bundle both printed 0.1.0, and both executables carried the hardened runtime and exactly the two entitlements. In a throwaway HOME, the bundled `mesa` unpacked the skills and wrote the vault template byte for byte. Its hook commands named the executable itself. Opened from Finder with launchd's PATH, the app's `mesa` children got the login shell's PATH (Homebrew, `~/.local/bin`, nvm). Run from the mounted DMG, the app showed the move-to-Applications warning. An `--build-sea` probe showed that Node 26 runs an ESM main with top-level await, and that `process.argv[1]` is the executable, so `argv.slice(2)` is unchanged.

## Consequences

The DMG is about 100 MB, mostly two copies of Node. A release needs Apple's yearly developer membership and the secrets listed in `docs/release.md`; losing the updater key means no installed copy can update again. `~/.mesa/.skills` is a dot-folder beside the profiles; `otherProfilesSessions` reads it as a profile with no sessions. Node's version for the executable is pinned in `build.sh` apart from `.nvmrc` (24, the development Node), so updating either one is a deliberate change.

## Amendment 2026-10-03: build number and attributions are assets (#478)

The single executable also carries `build`, the commit count that is the app's `CFBundleVersion`, and `attributions.json`, which `scripts/release/licenses.mjs` writes: the pinned Node's `LICENSE` (now extracted from its tarball too), the production npm packages of `@mesa/cli` with its workspace packages and of `@mesa/desktop`, the app's Rust crates (normal dependencies, for both Mac targets), and the vendored skills with a `LICENSE` or `NOTICE`. `mesa about --json` returns them, and the app's About Mesa screen reads them through it, so the file never enters the frontend bundle. Outside the executable the build is `dev` and the list is empty with a note. The macOS app menu's About Mesa opens that screen instead of the native panel.
