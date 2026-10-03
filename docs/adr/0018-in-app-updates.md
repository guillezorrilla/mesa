# ADR-0018: In-app updates over static GitHub Release feeds, with channels and revocation

Status: accepted
Date: 2026-10-02

## Context

#429. Since #431 every Release carries a signed update archive (`Mesa.app.tar.gz` and `.sig`) and `latest.json`, and a beta also replaces `latest.json` on the fixed prerelease `beta`. Mesa should update itself the way a desktop app does: download in the background, then offer "vX.Y.Z is ready to install." with Later and Install, and relaunch on the new version while every session keeps running. AGENTS.md wants the logic in core, a `mesa` command, and a screen. Tauri's updater plugin runs in Rust, apart from the Node CLI, and its JS `check()` cannot change the endpoint.

## Decision

**Hosting.** The feeds are static Release assets on this public repo, with no server: stable is `releases/latest/download/latest.json` (GitHub's `latest` skips prereleases and drafts), beta is `releases/download/beta/latest.json`, and the revocation list is `releases/download/beta/revoked.json`. Release downloads are not under the 60-per-hour unauthenticated API limit; nothing calls `api.github.com`. Staged rollout and delta updates are out of scope.

**Channels.** Core (`packages/core/src/update/`) owns the channel, the version check and revocation. The channel is `update.channel` in the profile config, set by `mesa update channel` and Settings > General. Unset, it follows the running version: a prerelease follows beta, so a fresh beta install finds the next beta without any setting. Beta reads both feeds and takes the newer release, so a stable newer than the newest beta is offered there too. A version is available only when it is above the running one (semver, so `beta.10` follows `beta.9`), so downgrades are never offered. A feed that answers 404 has no release yet; any other failure is an error.

**The app.** Rust (`updater.rs`) runs the schedule, apart from the renderer: the revocation read at launch, the first check 15 seconds later, then every 4 hours, and a check on demand from the profile menu, Settings, the revoked dialog, or the `mesa://update/install` link. Two checks of one channel never come closer than 10 minutes; a check inside that window returns the last result and, when asked for by a person, shows a dismissed update again. A check runs `mesa update check --json`, and when a newer version is available, builds the updater with that check's feed as its one endpoint (`updater_builder().endpoints(...)`), downloads the archive, and keeps the verified bytes until Install. Only then does the dialog appear. Later hides it until the next launch, a newer version or a manual check, and an "Update ready" entry stays in the profile menu. Install replaces the bundle where it runs and relaunches. The dialogs live in their own React root, so a screen that fails to render cannot block the update that fixes it. A development build checks only when asked; a development build, an ad-hoc signed build and a copy running from the DMG or a translocated path say why they cannot update and offer the download page instead of Install.

**Signing.** The updater key from #431 signs every archive (minisign, Ed25519 over the BLAKE2b-512 of the file, plus a global signature over the trusted comment). Its public key is in `tauri.conf.json`, and the plugin refuses an archive whose signature does not verify before anything is installed. The CLI cannot use the plugin, so core verifies the same signature itself with Node's crypto (`update/minisign.ts`); a test keeps core's copy of the public key equal to `tauri.conf.json`'s.

**The CLI.** `mesa update check --json` prints `{current, latest?, available, channel, notes?, revoked?, feed?, page}`. `mesa update install` downloads and verifies the archive, then either opens `mesa://update/install` when the app runs (the app checks, downloads and shows its dialog, so a person still chooses Install) or, with the app closed, unpacks it beside the installed app and swaps the bundles, putting the old one back if the new one cannot move in. A `mesa` outside an installed `Mesa.app` refuses and names the download page.

**Revocation.** `revoked.json` is `{schemaVersion: 1, revokedVersions: [{version, reason}]}`, where `version` is a version or a semver range. When the running version matches, the app shows a blocking dialog with the reason, "Check for update" and "Quit". A failed or malformed read never blocks.

**Why sessions survive.** Sessions run in the profile's tmux server, not in the app (ADR-0007); the app's terminals are tmux clients. Replacing and relaunching the app ends only those clients. The relaunched app lists the same sessions from `mesa sessions` and reattaches.

## Evidence

On 2026-10-02 core's verifier accepted the published `v0.1.0-beta.3` archive with its `latest.json` signature and the committed public key, and refused the same archive with one byte changed. The plugin (tauri-plugin-updater 2.12.0) verifies the signature inside `Update::download` before returning the bytes, so `install` never sees an unverified archive.

## Consequences

Every beta must keep shipping `latest.json` on the `beta` prerelease, and every stable must be marked latest, or installed copies stop seeing updates. Revoking a version is uploading a new `revoked.json` to the `beta` prerelease (`docs/release.md`). Losing the updater key still means no installed copy can update again (ADR-0017). An update is applied by the user who runs Mesa; when `/Applications` is not writable, the plugin asks for an administrator, and `mesa update install` fails with the permission error.
