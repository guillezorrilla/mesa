#!/usr/bin/env bash
# Locks down the public repo (#430): only the owner, and agents acting as him, can change
# code, tags or releases. Rulesets are free only on public repos, so run it after the flip.
#
#   scripts/github/protect.sh          apply, printing each setting it changed
#   scripts/github/protect.sh --check  report drift and change nothing; exits 1 on drift
#
# Each setting is read, compared with the wanted state below, and written only when it
# differs, so a re-run updates rather than duplicates. Needs gh (signed in as the owner) and jq.
set -euo pipefail

REPO=${REPO:-guillezorrilla/mesa}
OWNER_ID=55284328            # guillezorrilla
ACTIONS_APP_ID=15368         # the GitHub Actions app, source of the required `verify` check
ADMIN_ROLE=5                 # repository admin; the owner is the only admin of a personal repo
case "${1:-}" in
  "") CHECK=0 ;;
  --check) CHECK=1 ;;
  *) echo "usage: $0 [--check]" >&2; exit 2 ;;
esac
drift=0

# shape($w): the wanted state's shape picked out of a GET response, so fields GitHub adds are
# ignored. Arrays come out in a stable order (the wanted side goes through it too), and one of
# another length is kept whole so it differs.
SHAPE='def shape($w):
  if ($w|type) == "object" then . as $h | reduce ($w|keys[]) as $k ({}; .[$k] = ($h[$k] | shape($w[$k])))
  elif ($w|type) == "array" and (type == "array") then
    if length != ($w|length) then . else
    [ sort_by(.type? // tostring)[] ] as $h | [ $w | sort_by(.type? // tostring) | to_entries[] | . as $e | $h[$e.key] | shape($e.value) ] end
  else . end;'

# get <path>: the response body, or null when GitHub refuses the read with a 4xx other than 401:
# the setting does not exist yet (404), is not offered (403, rulesets on a private repo; 422),
# or is off (409, the allow list while all actions are allowed). Any other failure stops the
# whole script, so an unreadable setting is never taken for a missing one and written over.
get() {
  local out status
  if out=$(gh api "$1" 2>/dev/null); then
    echo "$out"
    return
  fi
  status=$(gh api -i "$1" 2>/dev/null | head -1 | awk '{print $2}')
  case "$status" in
    401) ;;
    4??) echo null; return ;;
  esac
  echo "protect.sh: GET $1 failed (HTTP ${status:-none})" >&2
  kill $$
}

# ensure <label> <current json> <wanted json> <apply command...>
ensure() {
  local label=$1 have want
  have=$(jq -cS --argjson w "$3" "$SHAPE shape(\$w)" <<<"$2")
  want=$(jq -cS "$SHAPE shape(.)" <<<"$3")
  shift 3
  if [ "$have" = "$want" ]; then
    echo "ok       $label"
    return
  fi
  drift=1
  if [ $CHECK = 1 ]; then
    echo "drift    $label"
    echo "         have $have"
    echo "         want $want"
  else
    "$@" >/dev/null
    echo "changed  $label"
  fi
}

send() { gh api -X "$1" "$2" --input - <<<"$3"; }

# setting <label> <method> <path> <wanted json>: a setting read and written at the same path.
setting() { ensure "$1" "$(get "$3")" "$4" send "$2" "$3" "$4"; }

# --- Repo features and merging ---------------------------------------------------------
repo_want='{
  "description": "A macOS app and CLI that runs many Claude Code, Codex and Antigravity sessions across projects, with memory in an Obsidian vault.",
  "has_wiki": false, "has_projects": false, "has_discussions": false,
  "allow_squash_merge": true, "allow_merge_commit": false, "allow_rebase_merge": false,
  "delete_branch_on_merge": true, "pull_request_creation_policy": "collaborators_only"
}'
setting "repo features and merging" PATCH "repos/$REPO" "$repo_want"

topics_want='{"names": ["ai-agents", "claude-code", "cli", "codex", "macos", "obsidian", "tauri", "tmux"]}'
setting "topics" PUT "repos/$REPO/topics" "$topics_want"

# --- Rulesets ----------------------------------------------------------------------------
# ruleset <wanted json>: creates the ruleset named in it, or updates the one with that name.
ruleset() {
  local name id
  name=$(jq -r .name <<<"$1")
  id=$(get "repos/$REPO/rulesets" | jq -r --arg n "$name" '.[]? | select(.name == $n) | .id' | head -1)
  if [ -n "$id" ]; then
    ensure "ruleset $name" "$(get "repos/$REPO/rulesets/$id")" "$1" send PUT "repos/$REPO/rulesets/$id" "$1"
  else
    ensure "ruleset $name" null "$1" send POST "repos/$REPO/rulesets" "$1"
  fi
}

# main: pull requests only (0 approvals, so the owner is never locked out), squash, linear,
# and the `verify` check from Actions. The owner bypasses only through a pull request.
ruleset "$(jq -n --argjson app $ACTIONS_APP_ID --argjson admin $ADMIN_ROLE '{
  name: "main", target: "branch", enforcement: "active",
  conditions: {ref_name: {include: ["~DEFAULT_BRANCH"], exclude: []}},
  bypass_actors: [{actor_id: $admin, actor_type: "RepositoryRole", bypass_mode: "pull_request"}],
  rules: [
    {type: "deletion"}, {type: "non_fast_forward"}, {type: "required_linear_history"},
    {type: "pull_request", parameters: {
      required_approving_review_count: 0, dismiss_stale_reviews_on_push: true,
      require_code_owner_review: false, require_last_push_approval: false,
      required_review_thread_resolution: false, allowed_merge_methods: ["squash"]}},
    {type: "required_status_checks", parameters: {
      strict_required_status_checks_policy: false,
      required_status_checks: [{context: "verify", integration_id: $app}]}}
  ]}')"

# Release tags: only the owner creates, moves or deletes a v* tag.
ruleset "$(jq -n --argjson admin $ADMIN_ROLE '{
  name: "release tags", target: "tag", enforcement: "active",
  conditions: {ref_name: {include: ["refs/tags/v*"], exclude: []}},
  bypass_actors: [{actor_id: $admin, actor_type: "RepositoryRole", bypass_mode: "always"}],
  rules: [{type: "creation"}, {type: "update"}, {type: "deletion"}]}')"

# --- Actions -----------------------------------------------------------------------------
perm_want='{"enabled": true, "allowed_actions": "selected", "sha_pinning_required": true}'
setting "actions: allowed and SHA-pinned" PUT "repos/$REPO/actions/permissions" "$perm_want"

# GitHub-owned and verified creators, plus the third-party actions ci.yml uses.
selected_want='{"github_owned_allowed": true, "verified_allowed": true,
  "patterns_allowed": ["dtolnay/rust-toolchain@*", "pnpm/action-setup@*", "Swatinem/rust-cache@*"]}'
setting "actions: allow list" PUT "repos/$REPO/actions/permissions/selected-actions" "$selected_want"

token_want='{"default_workflow_permissions": "read", "can_approve_pull_request_reviews": false}'
setting "actions: read-only token, no PR approvals" PUT "repos/$REPO/actions/permissions/workflow" "$token_want"

fork_want='{"approval_policy": "all_external_contributors"}'
setting "actions: approve every outside contributor's run" PUT \
  "repos/$REPO/actions/permissions/fork-pr-contributor-approval" "$fork_want"

retention_want='{"days": 30}'
setting "actions: 30-day log retention" PUT \
  "repos/$REPO/actions/permissions/artifact-and-log-retention" "$retention_want"

# --- The release environment -------------------------------------------------------------
env_want=$(jq -n --argjson me $OWNER_ID '{
  reviewers: [$me], deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}}')
env_body=$(jq -n --argjson me $OWNER_ID '{
  reviewers: [{type: "User", id: $me}], prevent_self_review: false,
  deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}}')
env_have=$(get "repos/$REPO/environments/release" |
  jq -c '{reviewers: [.protection_rules[]? | select(.type == "required_reviewers") | .reviewers[].reviewer.id],
          deployment_branch_policy}')
ensure "environment release: owner approves" "$env_have" "$env_want" send PUT "repos/$REPO/environments/release" "$env_body"

# release_tags_only: the release environment deploys only from v* tags. The v* policy is added
# before any other is removed, so a failure never leaves the environment open to every branch.
release_tags_only() {
  local path="repos/$REPO/environments/release/deployment-branch-policies" id
  get "$path" | jq -e '.branch_policies[]? | select(.name == "v*" and .type == "tag")' >/dev/null ||
    send POST "$path" '{"name": "v*", "type": "tag"}'
  for id in $(get "$path" | jq -r '.branch_policies[]? | select(.name != "v*" or .type != "tag") | .id'); do
    gh api -X DELETE "$path/$id"
  done
}
ensure "environment release: v* tags only" \
  "$(get "repos/$REPO/environments/release/deployment-branch-policies" | jq -c '[.branch_policies[]? | {name, type}]')" \
  '[{"name": "v*", "type": "tag"}]' release_tags_only

# --- Security ----------------------------------------------------------------------------
scan_want='{"security_and_analysis": {"secret_scanning": {"status": "enabled"},
  "secret_scanning_push_protection": {"status": "enabled"}}}'
setting "secret scanning with push protection" PATCH "repos/$REPO" "$scan_want"

alerts_have=$(gh api "repos/$REPO/vulnerability-alerts" >/dev/null 2>&1 && echo true || echo false)
ensure "dependabot alerts" "$alerts_have" true gh api -X PUT "repos/$REPO/vulnerability-alerts"

ensure "dependabot security updates" "$(get "repos/$REPO/automated-security-fixes" | jq -c '.enabled // false')" true \
  gh api -X PUT "repos/$REPO/automated-security-fixes"

ensure "private vulnerability reporting" "$(get "repos/$REPO/private-vulnerability-reporting" | jq -c '.enabled // false')" \
  true gh api -X PUT "repos/$REPO/private-vulnerability-reporting"

codeql_want='{"state": "configured", "languages": ["javascript-typescript"], "query_suite": "default"}'
# GitHub answers with the language and its aliases (javascript, typescript), so the check asks
# only whether javascript-typescript is among them.
codeql_have=$(get "repos/$REPO/code-scanning/default-setup" |
  jq -c '{state, query_suite, languages: (if (.languages // []) | index("javascript-typescript") then ["javascript-typescript"] else .languages end)}')
ensure "codeql default setup" "$codeql_have" "$codeql_want" send PATCH "repos/$REPO/code-scanning/default-setup" "$codeql_want"

if [ $CHECK = 1 ] && [ $drift = 1 ]; then
  echo "drift found: run scripts/github/protect.sh to apply"
  exit 1
fi
[ $CHECK = 1 ] && echo "no drift"
exit 0
