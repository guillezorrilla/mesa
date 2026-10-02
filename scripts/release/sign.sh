#!/bin/sh
# Signs, notarises and staples the DMG that build.sh made (Tauri already did the app inside it),
# then fails unless Gatekeeper accepts it and the app and its bundled mesa carry the hardened
# runtime with exactly the entitlements in Entitlements.plist. ADR-0017, docs/release.md.
set -eu
cd "$(dirname "$0")/../.."
. scripts/release/env.sh
require APPLE_API_KEY APPLE_API_ISSUER
signing_identity
api_key_file

dmg="$DIST/$dmg"
app="$BUNDLE/macos/Mesa.app"
[ -f "$dmg" ] || { echo "release: no $dmg; run pnpm release:build first" >&2; exit 1; }

codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$dmg"
xcrun notarytool submit "$dmg" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" \
  --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$dmg"

xcrun stapler validate "$dmg"
spctl -a -vv -t install "$dmg"
want=$(plutil -convert json -o - apps/desktop/src-tauri/Entitlements.plist | jq -r 'keys | join(" ")')
for binary in "$app" "$app/Contents/MacOS/mesa"; do
  codesign -dv --entitlements - "$binary" 2>&1 | grep -q 'flags=.*(runtime)' ||
    { echo "release: $binary lacks the hardened runtime" >&2; exit 1; }
  got=$(codesign -d --entitlements - --xml "$binary" 2>/dev/null | plutil -convert json -o - - |
    jq -r 'keys | join(" ")')
  [ "$got" = "$want" ] || { echo "release: $binary has entitlements [$got], not [$want]" >&2; exit 1; }
done
echo "release: $dmg is signed, notarised and stapled"
