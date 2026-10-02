#!/bin/sh
# Publishes what build.sh made as the GitHub Release v<version> (ADR-0017, docs/release.md): the
# DMG under its versioned and its stable "latest" name, the update archive and its signature,
# latest.json for the updater (#429), and SHA256SUMS. A beta is a prerelease and also replaces
# latest.json on the fixed prerelease `beta`, the beta channel's feed. Re-running replaces assets.
set -eu
cd "$(dirname "$0")/../.."
. scripts/release/env.sh

tag="v$version"
for file in "$dmg" Mesa.app.tar.gz Mesa.app.tar.gz.sig; do
  [ -f "$DIST/$file" ] || { echo "release: no $DIST/$file; run pnpm release:build first" >&2; exit 1; }
done
xcrun stapler validate -q "$DIST/$dmg" ||
  { echo "release: $dmg is not notarised; run pnpm release:sign" >&2; exit 1; }
# A release is cut from main only: the tag CI was pushed, or the commit main is at.
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main ||
  { echo "release: $(git rev-parse --short HEAD) is not on origin/main" >&2; exit 1; }

cp "$DIST/$dmg" "$DIST/Mesa_universal.dmg"
url="https://github.com/$REPO/releases/download/$tag/Mesa.app.tar.gz"
jq -n --arg v "$version" --arg sig "$(cat "$DIST/Mesa.app.tar.gz.sig")" --arg url "$url" \
  --arg notes "https://github.com/$REPO/releases/tag/$tag" \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{version: $v, notes: $notes, pub_date: $date, platforms: {
     "darwin-aarch64": {signature: $sig, url: $url}, "darwin-x86_64": {signature: $sig, url: $url}}}' \
  >"$DIST/latest.json"
assets="$dmg Mesa_universal.dmg Mesa.app.tar.gz Mesa.app.tar.gz.sig latest.json"
# shellcheck disable=SC2086 # one word per asset
(cd "$DIST" && shasum -a 256 $assets >SHA256SUMS)

if gh release view "$tag" -R "$REPO" >/dev/null 2>&1; then
  echo "release: $tag exists; replacing its assets"
else
  if [ $beta = 1 ]; then channel="--prerelease --latest=false"; else channel="--latest"; fi
  # shellcheck disable=SC2086 # the channel flags
  gh release create "$tag" -R "$REPO" --target "$(git rev-parse HEAD)" --title "Mesa $version" \
    --generate-notes $channel
fi
# shellcheck disable=SC2086 # one word per asset
(cd "$DIST" && gh release upload "$tag" -R "$REPO" --clobber $assets SHA256SUMS)

if [ $beta = 1 ]; then
  gh release view beta -R "$REPO" >/dev/null 2>&1 ||
    gh release create beta -R "$REPO" --target main --prerelease --latest=false \
      --title "Beta channel" --notes "The beta update channel's latest.json; the builds are the v*-beta.* releases."
  gh release upload beta -R "$REPO" --clobber "$DIST/latest.json"
fi
echo "release: published https://github.com/$REPO/releases/tag/$tag"
