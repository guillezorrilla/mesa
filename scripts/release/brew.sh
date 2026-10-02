#!/bin/sh
# Points the mesa cask in the tap at the published stable release v<version> (ADR-0017,
# docs/release.md). It writes with HOMEBREW_TAP_TOKEN when set (CI: a GitHub App token scoped
# to the tap), else with gh's own sign-in.
set -eu
cd "$(dirname "$0")/../.."
. scripts/release/env.sh
[ $beta = 0 ] || { echo "release: $version is a beta; the cask follows stable releases only" >&2; exit 1; }

dmg="Mesa_${version}_universal.dmg"
sha=$(gh release download "v$version" -R "$REPO" -p SHA256SUMS -O - | awk -v f="$dmg" '$2 == f {print $1}')
[ -n "$sha" ] || { echo "release: no $dmg in v$version's SHA256SUMS; publish it first" >&2; exit 1; }

cask=$(cat <<EOF
cask "mesa" do
  version "$version"
  sha256 "$sha"

  url "https://github.com/$REPO/releases/download/v#{version}/Mesa_#{version}_universal.dmg"
  name "Mesa"
  desc "Runs many Claude Code and Codex sessions across projects"
  homepage "https://github.com/$REPO"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :ventura"

  app "Mesa.app"
  binary "#{appdir}/Mesa.app/Contents/MacOS/mesa"
end
EOF
)

[ -z "${HOMEBREW_TAP_TOKEN:-}" ] || export GH_TOKEN="$HOMEBREW_TAP_TOKEN"
path="repos/$TAP/contents/Casks/mesa.rb"
current=$(gh api "$path" --jq .sha 2>/dev/null || true)
gh api -X PUT "$path" -f message="mesa $version" -f content="$(printf '%s\n' "$cask" | base64 | tr -d '\n')" \
  ${current:+-f sha="$current"} >/dev/null
echo "release: $TAP's mesa cask is at $version"
