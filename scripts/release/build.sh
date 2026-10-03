#!/bin/sh
# Builds a release into release/dist (ADR-0017, docs/release.md): the mesa CLI as one universal
# executable (a Node single executable application), the universal Mesa.app with it inside as
# Contents/MacOS/mesa, signed, notarised and stapled by Tauri, its DMG and update archive, and
# then sign.sh notarises and checks the DMG.
#
# APPLE_SIGNING_IDENTITY=- pnpm release:build makes an ad-hoc signed test build with no secrets.
set -eu
cd "$(dirname "$0")/../.."
. scripts/release/env.sh

# Node 26 for the single executable: pinned, and checked against nodejs.org's SHASUMS256.txt.
NODE_VERSION=26.10.0
NODE_SHA256_arm64=751fdf7439f115d87ee2a8f3f18c065b6151852068e3e666ac60ac2996f75ac9
NODE_SHA256_x64=ebbe9ab9b58ad6bb54390d6e2c862c1afa7d4475fb7e8ae8146acde211bf70df
if [ $adhoc = 0 ]; then
  require APPLE_API_KEY APPLE_API_ISSUER TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  api_key_file
  # CI: the certificate goes into a keychain of its own, which the workflow deletes after.
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    require APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD RUNNER_TEMP
    keychain="$RUNNER_TEMP/mesa-release.keychain-db"
    keychain_password=$(openssl rand -hex 24)
    security create-keychain -p "$keychain_password" "$keychain"
    security set-keychain-settings -lut 21600 "$keychain"
    security unlock-keychain -p "$keychain_password" "$keychain"
    (umask 077 && printf %s "$APPLE_CERTIFICATE" | base64 -d >"$RUNNER_TEMP/mesa-cert.p12")
    security import "$RUNNER_TEMP/mesa-cert.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" \
      -T /usr/bin/codesign >/dev/null
    rm -f "$RUNNER_TEMP/mesa-cert.p12"
    security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain" >/dev/null
    # shellcheck disable=SC2046 # the existing keychains, one word each
    security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
  fi
  signing_identity
fi

# --- The CLI as one universal executable --------------------------------------------------
work=release/sea
rm -rf "$work" "$DIST"
mkdir -p "$work" "$DIST" release/node
for arch in arm64 x64; do
  dir=release/node/node-v$NODE_VERSION-darwin-$arch
  if [ ! -x "$dir/bin/node" ]; then
    curl -fsSL -o "$dir.tar.gz" "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-darwin-$arch.tar.gz"
    eval "sum=\$NODE_SHA256_$arch"
    echo "$sum  $dir.tar.gz" | shasum -a 256 -c --quiet
    tar -xzf "$dir.tar.gz" -C release/node "node-v$NODE_VERSION-darwin-$arch/bin/node"
    rm "$dir.tar.gz"
  fi
done
case $(uname -m) in arm64) node=release/node/node-v$NODE_VERSION-darwin-arm64/bin/node ;;
*) node=release/node/node-v$NODE_VERSION-darwin-x64/bin/node ;; esac

pnpm --filter @mesa/core --filter @mesa/cli build
# One ESM file; CommonJS dependencies reach Node's builtins through a real require.
pnpm --filter @mesa/cli exec esbuild dist/mesa.js --bundle --platform=node --format=esm \
  --target=node26 --outfile="$PWD/$work/mesa.mjs" --log-level=warning \
  --banner:js="import { createRequire as __mesaRequire } from 'node:module'; const require = __mesaRequire(import.meta.url);"
printf %s "$version" >"$work/version"

# The assets mesa reads inside the executable: the version, the vault template, the skills.
for arch in arm64 x64; do
  git ls-files skills | "$node" -e '
    const [work, arch, base] = process.argv.slice(1);
    const files = require("node:fs").readFileSync(0, "utf8").trim().split("\n");
    const assets = { version: `${work}/version`, "vault-AGENTS.md": "packages/core/templates/vault-AGENTS.md" };
    for (const file of files) assets[file] = file;
    console.log(JSON.stringify({ main: `${work}/mesa.mjs`, mainFormat: "module", output: `${work}/mesa-${arch}`,
      executable: base, assets, disableExperimentalSEAWarning: true }));
  ' "$work" "$arch" "release/node/node-v$NODE_VERSION-darwin-$arch/bin/node" >"$work/sea-$arch.json"
  "$node" --build-sea "$work/sea-$arch.json" >/dev/null
  codesign --sign - --force "$work/mesa-$arch"
done
# externalBin wants one per target: each slice for its arch's compile, the universal one to ship.
bin=apps/desktop/src-tauri/binaries/mesa
mkdir -p "$(dirname "$bin")"
cp "$work/mesa-arm64" "$bin-aarch64-apple-darwin"
cp "$work/mesa-x64" "$bin-x86_64-apple-darwin"
lipo -create "$work/mesa-arm64" "$work/mesa-x64" -output "$bin-universal-apple-darwin"

# --- The app, its DMG and its update archive -----------------------------------------------
# The build number only grows: main's history is linear (protect.sh), so its commit count does.
build_number=$(git rev-list --count HEAD)
overrides="\"macOS\":{\"bundleVersion\":\"$build_number\"}"
# An ad-hoc build without the updater key makes no update archive.
[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || overrides="$overrides,\"createUpdaterArtifacts\":false"
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null
# Tauri would import APPLE_CERTIFICATE into a keychain of its own; the one above is used instead.
(cd apps/desktop && env -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD \
  pnpm exec tauri build --target universal-apple-darwin --ci \
  --config src-tauri/tauri.release.conf.json \
  --config "{\"bundle\":{$overrides}}")

cp "$BUNDLE/dmg/$dmg" "$DIST/"
[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] ||
  cp "$BUNDLE/macos/Mesa.app.tar.gz" "$BUNDLE/macos/Mesa.app.tar.gz.sig" "$DIST/"

# --- Smoke checks: both slices of the bundled mesa run and report this version --------------
mesa="$BUNDLE/macos/Mesa.app/Contents/MacOS/mesa"
[ "$(lipo -archs "$mesa")" = "x86_64 arm64" ] || { echo "release: $mesa is not universal" >&2; exit 1; }
for arch in arm64 x86_64; do
  got=$(arch -"$arch" "$mesa" --version)
  [ "$got" = "$version" ] || { echo "release: $arch mesa --version says $got, not $version" >&2; exit 1; }
done
echo "release: built Mesa $version (build $build_number) into $DIST"

[ $adhoc = 1 ] || sh scripts/release/sign.sh
