# Releasing Mesa

A release is a signed, notarised, stapled universal DMG with the `mesa` CLI inside the app, published as a GitHub Release with the update archive, `latest.json`, `SHA256SUMS` and build provenance, plus a Homebrew cask for stable releases. The design is in [ADR-0017](adr/0017-ci-and-signed-releases.md). The same scripts run in CI and by hand:

| Command | Script | What it does |
| --- | --- | --- |
| `pnpm release:version X.Y.Z[-beta.N]` | `scripts/release/version.sh` | Writes the one version into every `package.json`, `Cargo.toml` and `Cargo.lock` |
| `pnpm check:version` | same, `--check` | Fails on drift; part of `pnpm verify` |
| `pnpm release:build` | `scripts/release/build.sh` | Builds the CLI executable, the app, the DMG and update archive into `release/dist`, then runs `release:sign` |
| `pnpm release:sign` | `scripts/release/sign.sh` | Signs, notarises and staples the DMG, then checks Gatekeeper and the entitlements |
| `pnpm release:publish` | `scripts/release/publish.sh` | Creates the GitHub Release `v<version>` and uploads every asset |
| `pnpm release:brew` | `scripts/release/brew.sh` | Points the tap's `mesa` cask at the stable release |

`vX.Y.Z` is a stable release. `vX.Y.Z-beta.N` is a prerelease on the beta channel, which also replaces `latest.json` on the fixed prerelease `beta`. A release holds `Mesa_X.Y.Z_universal.dmg`, `Mesa_universal.dmg` (the same file under a name that stays the same), `Mesa.app.tar.gz`, `Mesa.app.tar.gz.sig`, `latest.json` and `SHA256SUMS`. Release notes are GitHub's generated notes, grouped by label through `.github/release.yml`.

## One-time setup

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/) (99 USD a year).
2. Create a **Developer ID Application** certificate: Xcode > Settings > Accounts > Manage Certificates > + > Developer ID Application. Keep it in the login keychain for releases by hand. For CI, export it with its private key from Keychain Access > My Certificates as `mesa.p12`, with a password.
3. Create an App Store Connect API key: App Store Connect > Users and Access > Integrations > Team Keys > +, role Developer. Download `AuthKey_<KEYID>.p8` (it downloads once), and note the key id and the issuer id.
4. Generate the updater key, with a password, and back up both files somewhere safe. Losing the key means no installed Mesa can ever update again.

   ```sh
   pnpm --dir apps/desktop tauri signer generate -w ~/.tauri/mesa.key
   ```

   Put the public key, the contents of `~/.tauri/mesa.key.pub`, into `apps/desktop/src-tauri/tauri.release.conf.json` as `plugins.updater.pubkey`, and commit it. It is public.
5. Create the public repo `guillezorrilla/homebrew-tap` with a README. Create a GitHub App (Settings > Developer settings > GitHub Apps > New): no webhook, Repository permissions > Contents: Read and write, installable only on this account. Install it on `homebrew-tap` only. Note its App ID and generate a private key (`.pem`).
6. Store the secrets. Each command reads the value from a file or a prompt, so nothing lands in shell history.

   For CI, in the `release` environment:

   ```sh
   base64 -i mesa.p12 | gh secret set APPLE_CERTIFICATE --env release
   gh secret set APPLE_CERTIFICATE_PASSWORD --env release            # prompts
   gh secret set APPLE_API_KEY --env release                         # the key id
   gh secret set APPLE_API_ISSUER --env release                      # the issuer id
   base64 -i AuthKey_<KEYID>.p8 | gh secret set APPLE_API_KEY_BASE64 --env release
   gh secret set TAURI_SIGNING_PRIVATE_KEY --env release < ~/.tauri/mesa.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --env release    # prompts
   gh secret set HOMEBREW_APP_ID --env release                       # the App ID
   gh secret set HOMEBREW_APP_PRIVATE_KEY --env release < mesa-tap.<date>.private-key.pem
   ```

   For releases by hand, in the login Keychain (service `mesa-release`, account = the name). `-w` last makes `security` prompt for the value:

   ```sh
   security add-generic-password -U -s mesa-release -a APPLE_API_KEY -w
   security add-generic-password -U -s mesa-release -a APPLE_API_ISSUER -w
   security add-generic-password -U -s mesa-release -a APPLE_API_KEY_BASE64 -w "$(base64 -i AuthKey_<KEYID>.p8)"
   security add-generic-password -U -s mesa-release -a TAURI_SIGNING_PRIVATE_KEY -w "$(cat ~/.tauri/mesa.key)"
   security add-generic-password -U -s mesa-release -a TAURI_SIGNING_PRIVATE_KEY_PASSWORD -w
   ```

   The certificate stays in the login keychain, and `build.sh` finds its identity. Set `APPLE_SIGNING_IDENTITY` when there is more than one. Instead of the Keychain, the same `NAME=value` lines can go in `.env.release.local` at the repo root, which git ignores.

Every script checks each variable it needs before it uses it, and names the missing one with these commands.

## Cut a release with CI

1. Open a pull request that runs `pnpm release:version 0.1.0-beta.2` (or `0.1.0`), and merge it.
2. From `main` at that commit, push the tag: `git tag v0.1.0-beta.2 && git push origin v0.1.0-beta.2`.
3. Approve the `release` environment in the workflow run (Actions > Release > Review deployments).
4. Check the result: `gh release view v0.1.0-beta.2` and `gh attestation verify Mesa_0.1.0-beta.2_universal.dmg -R guillezorrilla/mesa`. For a stable release the `brew` job also updates the cask: `brew install --cask guillezorrilla/tap/mesa`.

To re-run a release, dispatch the workflow from the tag itself, since the environment deploys from `v*` tags only: `gh workflow run release.yml --ref v0.1.0 -f tag=v0.1.0`. Publishing again replaces the assets.

## Cut a release by hand

On a Mac with the setup above, with `main` checked out at the version commit:

```sh
pnpm install --frozen-lockfile
pnpm release:build      # builds, signs, notarises (several minutes)
pnpm release:publish    # creates the tag v<version> at HEAD and the release
pnpm release:brew       # stable releases only
```

`publish` refuses a commit that is not on `origin/main`. A hand release has no provenance attestation, because only the workflow can sign one.

A test build needs no secrets. `APPLE_SIGNING_IDENTITY=- pnpm release:build` makes an ad-hoc signed app and DMG, without notarisation or update archives, that runs only on this Mac.

## Renewals

- **Developer ID certificate**: it is valid for five years. Before it expires, create a new one (step 2), then replace `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD` in the `release` environment. Installed copies keep working, because notarised apps stay valid after their certificate expires.
- **App Store Connect API key**: it does not expire. If it leaks, revoke it in App Store Connect and repeat step 3.
- **Updater key**: never rotate it casually. Copies already installed accept only updates signed with the key they shipped with.
- **Homebrew app key**: generate a new private key in the app's settings, replace `HOMEBREW_APP_PRIVATE_KEY`, and delete the old key.
- **Apple Developer Program**: renew it yearly. A lapsed membership stops notarisation, though copies already shipped still open.
