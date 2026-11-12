#!/bin/sh
# The merge gate: the `verify` job in .github/workflows/ci.yml; run it locally before a push.
set -eu
cd "$(dirname "$0")/.."
pnpm lint
pnpm check:version
# Built first: typecheck reads core's declarations and the bridge test runs the built CLI.
pnpm build
pnpm typecheck
pnpm test
# The phone app's dependencies and config against its Expo SDK (ADR-0027).
pnpm --filter @mesa/mobile doctor
cargo test --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml
# The push extension's decrypt logic against core's vectors.json (#1016); CryptoKit is Apple's.
if [ "$(uname)" = Darwin ]; then
  swift test --quiet --package-path apps/mobile/targets/notifications
fi
echo "verify: all green"
