#!/bin/sh
# The merge gate. Runs locally on pre-push; GitHub Actions is not used (no paid minutes).
set -eu
cd "$(dirname "$0")/.."
pnpm lint
pnpm typecheck
pnpm test
cargo test --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml
pnpm build
echo "verify: all green"
