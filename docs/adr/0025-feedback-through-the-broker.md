# ADR-0025: Feedback goes through the broker to a private repo

Status: accepted
Date: 2026-10-13

## Context

People using Mesa had no way to leave feedback without finding the GitHub repo and having an account there (#812). The owner asked for feedback written and sent inside Mesa, with no page opening, landing somewhere only the owner reads. Mesa is a local app with no accounts and no analytics ("the data stays home"), and the only thing Mesa hosts is the broker (ADR-0014), which until now only relayed OAuth, stored nothing and logged nothing. Sending feedback means a person's own words leave the Mac and persist elsewhere, which changes what the broker and the privacy policy promise, so it is recorded here.

## Decision

- **Where it lands:** an issue in a private GitHub repo, `guillezorrilla/mesa-feedback` (the Worker's `FEEDBACK_REPO` var names another), so feedback is never public, and the owner gets GitHub's notifications and triage. The title is the message's first line, cut to 70 characters; the body is the message, then `Mesa <version> (build <build>), from <from>`.
- **The route:** `POST /feedback` on the broker takes `{message, version, build, from}`. `message` is 1 to 5000 characters after trimming; `version`, `build` and `from` are each 1 to 40. It opens the issue with a fine-grained token that can only write issues in that repo, the Worker secret `FEEDBACK_GITHUB_TOKEN`, and answers `201 {}`: never the issue's number or URL. A bad body is 400, a missing token 500 `not_configured`, a GitHub failure 502, and a sixth request within a minute from one IP address 429 (the Worker's `FEEDBACK_LIMIT` rate-limit binding; without it, a self-hosted broker limits nothing).
- **What is sent:** only what the person typed, Mesa's version and build, and where it was written (the app screen's kind, such as `sessions` or `project`, or `cli`). No usage data, no session, no project name, no path. The app shows the attached line under the message before it is sent.
- **What the broker keeps:** still nothing. It logs no request or response body, and its only write is the issue. Mesa keeps no local copy and writes no receipt.
- **The callers:** `mesa.feedback.send` in core (`feedback/send.ts`), `mesa feedback "<message>" [--from <screen>]`, and Help > Send feedback in the app (`features/feedback/FeedbackDialog.tsx`).

## Evidence

- `apps/broker/src/broker.test.ts`: an issue is opened in the default or configured repo with the token, title and body; bad bodies, a missing token, a GitHub failure and a rate-limited IP each answer their status and reach no one.
- `packages/core/src/feedback/send.test.ts`: the message, version, build and `from` reach the broker; an empty or too long message sends nothing; a failure, a rate limit and no network each say it was not sent.
- `packages/cli/src/commands/feedback.test.ts` and `apps/desktop/src/app/App.help.test.tsx`: the command and the dialog send, thank, and on failure keep the text.

## Consequences

- The broker's privacy page says feedback is the one thing it forwards to be kept, and where.
- Spam is bounded by the rate limit and the repo being private; a flood would need a token rotation or the route turned off (unset the secret: the route answers `not_configured`).
- No reply to the person: there is no contact field. Adding one would mean collecting personal data, and a new decision.
