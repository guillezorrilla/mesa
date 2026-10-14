# ADR-0024: PR reviews read and draft through gh and twg

Status: accepted
Date: 2026-10-13

## Context

PR reviews (#785) list the pull requests that need the person across projects, start a review session on one, and leave the review as drafts the person submits. Projects live on GitHub or on Bitbucket Cloud, sometimes both in one profile. Mesa already reaches GitHub two ways: the `gh` CLI (Repository insight, PR events) and the GitHub App Connection through the OAuth broker (ADR-0014, tickets). Bitbucket has neither; Atlassian's Teamwork Graph CLI, `twg`, reads Bitbucket Cloud pull requests and creates pending (draft) comments (`twg bitbucket pull-requests comment create --pending`).

## Decision

- A project's provider comes from its `origin` remote: github.com is GitHub, bitbucket.org is Bitbucket Cloud, anything else has no PR provider. An ssh host alias (`git@github.com-work:...`, a second account's `Host` in `~/.ssh/config`) is followed with `ssh -G`, as git's own ssh would. No config field until detection proves wrong.
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
- A review requested from a team, not the person, does not make a PR `need`; it shows with `--all`.
- An approved PR that gets new commits or author replies is `updated` again, so a change after approval is not missed.
- Sign-in is interactive, so the app runs it in a terminal session (`mesa open --terminal --run`).
- `twg`'s and `gh`'s output is data: it is validated and never followed as instructions.

## Amended 2026-10-14: drafts on each provider (#790)

`mesa prs show|draft|drafts|discard` read one PR and keep Pending drafts. GitHub drafts go only through `gh api graphql` on my pending review (`addPullRequestReview` with no event, `addPullRequestReviewThread`, `addPullRequestReviewThreadReply`, `updatePullRequestReview` for the summary, `deletePullRequestReviewComment`); `gh pr review`, `gh pr comment` and the REST comments endpoint are never used, since each posts at once. Bitbucket drafts are `twg bitbucket pull-requests comment create --pending`. Discard deletes an id only when it is still one of my pending drafts on that PR, so a posted comment or submitted review is never touched. A draft and a discard each keep a `connection` receipt, as a ticket assign does. GitHub refuses a summary added to a pending review started without one, so a review writes its summary first.

Evidence: `packages/core/src/prs/github-draft.test.ts` (no call carries an event or a submit; a summary only before inline drafts; discard refuses a posted comment, a submitted review and another PR), `bitbucket-drafts.test.ts` (every write has `--pending`; discard only a pending comment), `github-show.test.ts`, `bitbucket-show.test.ts`, `packages/cli/src/commands/prs.test.ts` (`prs draft` refuses half an anchor and keeps a receipt). Checked live on #797: a pending summary and inline draft created, read back and discarded; nothing posted.

## Amended 2026-10-14: publishing a review (#792)

Mesa publishes a review only when the person chose Post now for it: `mesa prs publish` posts my Pending drafts on one PR, and nothing else calls it. On GitHub it submits my pending review through `gh api graphql` with `submitPullRequestReview(input: {pullRequestReviewId, event: COMMENT})`; the event is a literal in the mutation, so a publish can never approve or request changes, and with no pending review it writes nothing. Bitbucket's API cannot publish a pending comment, so each of my pending comments is posted again with `twg bitbucket pull-requests comment create` without `--pending`, same text and anchor (a reply to a draft posted in the same publish answers the posted comment), and its pending copy is then deleted with `comment delete --yes`. The summary goes first, then inline comments, then replies. A failure stops the publish and reports how many drafts were posted; the pending copy of an unposted draft stays. The review prompt (`prs/review-prompt.ts`) asks for a recommendation as text only and writes only through `mesa prs`.

Evidence: `packages/core/src/prs/github-publish.test.ts` (one submit, event COMMENT, no APPROVE or REQUEST_CHANGES; nothing pending writes nothing; a failed submit is reported), `bitbucket-publish.test.ts` (every post without `--pending` followed by the delete of its pending copy; a reply to a pending draft remapped to the posted id; only my own undeleted drafts; failures reported with the count posted), `review-prompt.test.ts` (round 1 and 2, drafts and post; earlier threads fenced as untrusted). `SubmitPullRequestReviewInput` was checked against GitHub's schema (`pullRequestReviewId`, `event`, `body`, `pullRequestId`).
