# Sourced by the release scripts (ADR-0017, docs/release.md). Run from the repo root.
#
# Each release variable that is unset is read from the login Keychain (service mesa-release,
# account = the variable's name), else from the gitignored .env.release.local (NAME=value lines).
# In CI they come from the release environment's secrets instead.

RELEASE_VARS="APPLE_SIGNING_IDENTITY APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_BASE64
  TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
REPO=${REPO:-guillezorrilla/mesa}
TAP=${TAP:-guillezorrilla/homebrew-tap}
DIST=release/dist

for name in $RELEASE_VARS; do
  eval "given=\${$name+set}"
  [ -n "$given" ] && continue
  if value=$(security find-generic-password -s mesa-release -a "$name" -w 2>/dev/null); then
    export "$name=$value"
  elif [ -f .env.release.local ] && value=$(sed -n "s/^$name=//p" .env.release.local | tail -1) &&
    [ -n "$value" ]; then
    export "$name=$value"
  fi
done
unset name given value

# require NAME...: stops, saying how to set it, when any NAME is empty.
require() {
  for name; do
    eval "value=\${$name:-}"
    if [ -z "$value" ]; then
      echo "release: $name is empty. Set it for CI with: gh secret set $name --env release" >&2
      echo "  and for this Mac with: security add-generic-password -U -s mesa-release -a $name -w" >&2
      echo "  (docs/release.md says what each one holds)" >&2
      exit 1
    fi
  done
}

# version: the one version (scripts/release/version.sh); beta: whether it is a beta.
version=$(sh scripts/release/version.sh)
case $version in *-beta.*) beta=1 ;; *) beta=0 ;; esac

# adhoc: APPLE_SIGNING_IDENTITY "-" makes an ad-hoc signed test build, never notarised or published.
adhoc=0
[ "${APPLE_SIGNING_IDENTITY:-}" = "-" ] && adhoc=1

# api_key_file: writes the App Store Connect key to a file for notarisation, deleted on exit.
api_key_file() {
  require APPLE_API_KEY_BASE64
  APPLE_API_KEY_PATH="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mesa-AuthKey.p8"
  (umask 077 && printf %s "$APPLE_API_KEY_BASE64" | base64 -d >"$APPLE_API_KEY_PATH")
  export APPLE_API_KEY_PATH
  trap 'rm -f "$APPLE_API_KEY_PATH"' EXIT
}
