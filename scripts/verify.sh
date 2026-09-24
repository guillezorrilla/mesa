#!/bin/sh
# The merge gate. Runs locally on pre-push; GitHub Actions is not used (no paid minutes).
set -eu
cd "$(dirname "$0")/.."
pnpm lint
pnpm typecheck
pnpm test
pnpm build
echo "verify: all green"
