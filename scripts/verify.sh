#!/bin/sh
# The merge gate. `pnpm verify` runs every stage; .github/workflows/ci.yml runs each stage as its
# own job in parallel (`pnpm verify <stage> [vitest args]`), and its `verify` job needs them all.
set -eu
cd "$(dirname "$0")/.."
stage=${1:-all}
case $stage in all | checks | test | mobile | native) ;; *) echo "usage: pnpm verify [checks|test|mobile|native] [vitest args]" >&2; exit 2 ;; esac
[ $# -gt 0 ] && shift
run() { [ "$stage" = all ] || [ "$stage" = "$1" ]; }

if run checks; then
  pnpm lint
  pnpm check:version
  # Built first: typecheck reads core's declarations.
  pnpm build
  pnpm typecheck
fi
if run test; then
  # Some tests run core's and the CLI's build; `checks` made it when every stage runs.
  [ "$stage" = all ] || pnpm --filter @mesa/core --filter @mesa/cli build
  pnpm test "$@"
fi
if run mobile; then
  # The phone app's dependencies and config against its Expo SDK (ADR-0027).
  pnpm --filter @mesa/mobile doctor
fi
if run native; then
  cargo test --quiet --manifest-path apps/desktop/src-tauri/Cargo.toml
  # The push extension's decrypt logic against core's vectors.json (#1016); CryptoKit is Apple's.
  if [ "$(uname)" = Darwin ]; then
    swift test --quiet --package-path apps/mobile/targets/notifications
  fi
fi
echo "verify: $stage green"
