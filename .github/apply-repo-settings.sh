#!/usr/bin/env bash
#
# Repository settings as code, for maintainers.
#
# Applies the repo's security settings, merge settings, Actions policy, and
# the `main` branch ruleset through the GitHub API. Safe to re-run: each step
# overwrites the previous value, and the ruleset is updated in place.
#
# Requirements: GitHub CLI (`gh`), logged in as a repo admin (`gh auth login`).
# Usage:        .github/apply-repo-settings.sh [--with-copilot-review] [owner/repo]
#
#   --with-copilot-review  also add a ruleset that auto-requests a Copilot
#                          review on every PR. Needs a paid Copilot plan, and
#                          reviews count against that plan's usage.
#
# Contributors never need to run this.

set -uo pipefail

WITH_COPILOT=false
if [[ "${1:-}" == "--with-copilot-review" ]]; then WITH_COPILOT=true; shift; fi
REPO="${1:-sachin-sn/prompt-cookbook}"
RULESET_NAME="main protection"
failures=0

step() { printf '\n→ %s\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ✗ %s\n' "$1"; failures=$((failures + 1)); }

api() { gh api -H "Accept: application/vnd.github+json" "$@" >/dev/null; }

command -v gh >/dev/null || { echo "gh (GitHub CLI) is required: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }

# ---------------------------------------------------------------------------
step "General + merge settings"
# Squash-only keeps main's history one commit per PR, and PR titles become
# commit subjects. Wiki and Projects are unused, so they're turned off to
# reduce the surface area strangers can edit.
if api -X PATCH "repos/$REPO" --input - <<'JSON'
{
  "has_wiki": false,
  "has_projects": false,
  "allow_squash_merge": true,
  "allow_merge_commit": false,
  "allow_rebase_merge": false,
  "squash_merge_commit_title": "PR_TITLE",
  "squash_merge_commit_message": "PR_BODY",
  "delete_branch_on_merge": true,
  "allow_update_branch": true,
  "allow_auto_merge": false,
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON
then ok "squash-only merges, auto-delete branches, secret scanning + push protection"
else warn "could not update general settings"; fi

# ---------------------------------------------------------------------------
step "Dependabot + vulnerability reporting"
api -X PUT "repos/$REPO/vulnerability-alerts"            && ok "Dependabot alerts"                || warn "Dependabot alerts"
api -X PUT "repos/$REPO/automated-security-fixes"        && ok "Dependabot security updates"      || warn "Dependabot security updates"
api -X PUT "repos/$REPO/private-vulnerability-reporting" && ok "private vulnerability reporting"  || warn "private vulnerability reporting"

# ---------------------------------------------------------------------------
step "GitHub Actions policy"
# Only GitHub-owned actions (actions/*) may run. Third-party actions get
# added to an allowlist deliberately, when a later phase needs one.
if api -X PUT "repos/$REPO/actions/permissions" --input - <<'JSON'
{ "enabled": true, "allowed_actions": "selected" }
JSON
then
  api -X PUT "repos/$REPO/actions/permissions/selected-actions" --input - <<'JSON' \
    && ok "only GitHub-owned actions allowed" || warn "could not set the allowed-actions list"
{ "github_owned_allowed": true, "verified_allowed": false, "patterns_allowed": [] }
JSON
else warn "could not restrict allowed actions"; fi

# The default GITHUB_TOKEN is read-only, and workflows can't approve PRs.
api -X PUT "repos/$REPO/actions/permissions/workflow" --input - <<'JSON' \
  && ok "GITHUB_TOKEN read-only by default; workflows can't approve PRs" || warn "could not set workflow token permissions"
{ "default_workflow_permissions": "read", "can_approve_pull_request_reviews": false }
JSON

# Every PR from an outside contributor waits for a maintainer to click
# "Approve and run" before any workflow runs. No secrets are exposed to fork
# PRs either way, but this stops strangers from using CI minutes as free compute.
api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" --input - <<'JSON' \
  && ok "fork PR workflows need approval for all external contributors" \
  || warn "fork PR approval policy — set it by hand: Settings → Actions → General → 'Require approval for all external contributors'"
{ "approval_policy": "all_external_contributors" }
JSON

# ---------------------------------------------------------------------------
step "Ruleset: $RULESET_NAME"
# - No direct pushes, force-pushes, or deletion of main.
# - Every change arrives as a PR that passes the `validate` check, gets a
#   code-owner approval, and has all review threads resolved.
# - Bypass: repo admins, in "pull_request" mode only. That lets a solo
#   maintainer merge their own PRs (GitHub doesn't let you approve your own),
#   while still blocking direct pushes. Remove the bypass once there's a
#   second maintainer who can review.
# (integration_id 15368 = GitHub Actions, the app that reports `validate`.)
RULESET_JSON=$(cat <<JSON
{
  "name": "$RULESET_NAME",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "pull_request" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": true,
        "require_last_push_approval": true,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "validate", "integration_id": 15368 } ]
      }
    }
  ]
}
JSON
)

existing_id=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$RULESET_NAME\") | .id" 2>/dev/null | head -n1)
if [[ -n "$existing_id" ]]; then
  echo "$RULESET_JSON" | api -X PUT "repos/$REPO/rulesets/$existing_id" --input - \
    && ok "updated existing ruleset (id $existing_id)" || warn "could not update ruleset"
else
  echo "$RULESET_JSON" | api -X POST "repos/$REPO/rulesets" --input - \
    && ok "created ruleset" || warn "could not create ruleset"
fi

# ---------------------------------------------------------------------------
step "Code scanning (CodeQL default setup)"
# Free for public repos. Scans the TypeScript tooling and the workflow files
# on every PR and push to main. Findings show up in the PR and under
# Security → Code scanning.
if api -X PATCH "repos/$REPO/code-scanning/default-setup" --input - <<'JSON'
{ "state": "configured", "languages": ["javascript-typescript", "actions"], "query_suite": "extended" }
JSON
then ok "CodeQL enabled for TypeScript + GitHub Actions workflows"
else warn "CodeQL — enable by hand: Security → Code scanning → Set up → Default"; fi

# ---------------------------------------------------------------------------
if $WITH_COPILOT; then
  step "Ruleset: copilot review"
  # A separate ruleset, so it can be removed without touching main's
  # protection. Advisory only: Copilot leaves a comment review, which is not
  # an approval and doesn't satisfy the code-owner review requirement.
  COPILOT_RULESET_NAME="copilot review"
  COPILOT_JSON=$(cat <<JSON
{
  "name": "$COPILOT_RULESET_NAME",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "copilot_code_review", "parameters": { "review_on_push": true, "review_draft_pull_requests": false } }
  ]
}
JSON
)
  cid=$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$COPILOT_RULESET_NAME\") | .id" 2>/dev/null | head -n1)
  if [[ -n "$cid" ]]; then
    echo "$COPILOT_JSON" | api -X PUT "repos/$REPO/rulesets/$cid" --input - \
      && ok "updated Copilot review ruleset" || warn "Copilot review ruleset — add by hand: Settings → Rules → Rulesets"
  else
    echo "$COPILOT_JSON" | api -X POST "repos/$REPO/rulesets" --input - \
      && ok "created Copilot review ruleset" || warn "Copilot review ruleset — add by hand: Settings → Rules → Rulesets"
  fi
fi

# ---------------------------------------------------------------------------
echo
if (( failures )); then
  echo "Done with $failures step(s) failing — see ✗ lines above; each names the setting to fix by hand."
  exit 1
fi
echo "All settings applied. Review them at https://github.com/$REPO/settings"
