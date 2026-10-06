#!/bin/sh
# Fails on a direct file write in core outside its owners (ADR-0022): writeFileSync only in the
# atomic helpers and the output-log cut, which rewrites in place for tmux's open pipe (ADR-0001);
# appendFileSync only in the append-only logs. Anything else writes through writeFileAtomic,
# createFileAtomic, changeJson or changeYaml. Tests and their fixtures are left out.
set -eu
cd "$(dirname "$0")/.."
src=packages/core/src
writes=$(git grep -nE '(^|[^A-Za-z_])writeFileSync\(' -- "$src" ':!*.test.ts' ":!$src/testing" \
  ":!$src/lib/atomic-file.ts" ":!$src/lib/lock-file.ts" ":!$src/sessions/window/output-log.ts" || true)
appends=$(git grep -nE '(^|[^A-Za-z_])appendFileSync\(' -- "$src" ':!*.test.ts' ":!$src/testing" \
  ":!$src/sessions/signals/hook-events.ts" ":!$src/vault/notes.ts" ":!$src/vault/index-note.ts" \
  ":!$src/git/exclude.ts" || true)
if [ -n "$writes$appends" ]; then
  echo "direct file writes in core (write through lib/atomic-file.ts instead):"
  printf '%s\n' "$writes" "$appends" | grep -v '^$'
  exit 1
fi
echo "no direct file writes"
