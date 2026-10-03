#!/bin/sh
# The merge gate: the `verify` job in .github/workflows/ci.yml, and locally on pre-push.
set -eu
cd "$(dirname "$0")/.."
pnpm lint
pnpm check:version
# Built first: typecheck reads core's declarations and the bridge test runs the built CLI.
pnpm build
pnpm typecheck
pnpm test
cargo test --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml
echo "verify: all green"
