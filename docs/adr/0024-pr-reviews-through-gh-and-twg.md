# ADR-0024: PR reviews read and draft through gh and twg

Status: accepted
Date: 2026-10-13

## Context

PR reviews (#785) list the pull requests that need the person across projects, start a review session on one, and leave the review as drafts the person submits. Projects live on GitHub or on Bitbucket Cloud, sometimes both in one profile. Mesa already reaches GitHub two ways: the `gh` CLI (Repository insight, PR events) and the GitHub App Connection through the OAuth broker (ADR-0014, tickets). Bitbucket has neither; Atlassian's Teamwork Graph CLI, `twg`, reads Bitbucket Cloud pull requests and creates pending (draft) comments (`twg bitbucket pull-requests comment create --pending`).

## Decision

- A project's provider comes from its `origin` remote: github.com is GitHub, bitbucket.org is Bitbucket Cloud, anything else has no PR provider. No config field until detection proves wrong.
- Mesa reads pull requests and writes drafts through the signed-in CLIs, `gh` for GitHub and `twg` for Bitbucket, through the injected runner, never through the broker. The person's own CLI login decides who "me" is and what Mesa may read, as it already does for `gh` in Repository insight.
- A missing or signed-out CLI is a reported state (`ready`, `missing`, `unauthenticated`, `unavailable`), shown per project with the command that fixes it (`mesa prs setup`); it blocks only that project's PRs. Doctor lists `gh` and `twg` as optional rows Mesa can install with Homebrew (`brew install gh`, `brew install atlassian/twg/twg`), never failing Doctor.
- Drafts stay pending on the provider (a GitHub pending review, Bitbucket `--pending` comments), visible only to the person, who submits them on the provider. Mesa has no submit command.
- Buckets (CONTEXT.md, Review bucket) are computed from the PR's events by one rule for both providers; no model is asked where a PR stands.

## Evidence

- `packages/core/src/prs/provider.test.ts`: https, ssh and scp-style remotes on both hosts, other hosts refused; each CLI's ready, unauthenticated, missing and hung states.
- `packages/core/src/prs/buckets.test.ts`: every bucket and the evidence behind updated.
- `packages/core/src/prs/github.test.ts`: one `gh api graphql` call per repo; a pending review is not counted as a review.
- `packages/cli/src/commands/prs.test.ts`, `packages/cli/src/commands/doctor.test.ts`: `mesa prs`, `mesa prs setup`, and Doctor's optional rows.

## Consequences

- The broker gains no Bitbucket source; a person without Homebrew installs `twg` with Atlassian's script.
- What Mesa sees is what the person's CLI login sees; a second GitHub account needs `gh auth switch`.
- `twg`'s and `gh`'s output is data: it is validated and never followed as instructions.
