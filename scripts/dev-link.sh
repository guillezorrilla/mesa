#!/bin/sh
# Writes ~/.local/bin/mesa, a shim that runs this checkout's CLI build with the node used now.
# Development only; packaged installs are P7.
set -eu
cd "$(dirname "$0")/.."
node=$(command -v node) || { echo "node not found on PATH" >&2; exit 1; }
bin="$HOME/.local/bin"
mkdir -p "$bin"
printf '#!/bin/sh\nexec "%s" "%s" "$@"\n' "$node" "$PWD/packages/cli/dist/mesa.js" >"$bin/mesa"
chmod +x "$bin/mesa"
echo "linked $bin/mesa -> $PWD/packages/cli/dist/mesa.js"
case ":$PATH:" in
*":$bin:"*) ;;
*) echo "warning: $bin is not on PATH; add it in your shell profile" ;;
esac
