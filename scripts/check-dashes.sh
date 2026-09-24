#!/bin/sh
# Fails when any tracked text file contains an em dash (U+2014).
# Vendored third-party skills under .agents/skills and .claude/skills are excluded:
# they are managed by the skills CLI and would be overwritten on update.
set -eu
cd "$(dirname "$0")/.."
hits=$(git ls-files -z ':!.agents/skills' ':!.claude/skills' | xargs -0 grep -Il "$(printf '\342\200\224')" 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "em dash (U+2014) found in:"
  echo "$hits"
  exit 1
fi
echo "no em dashes"
