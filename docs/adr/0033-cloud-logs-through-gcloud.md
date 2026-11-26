# ADR-0033: Cloud Logs read through the person's own `gcloud`, not a Broker OAuth source

Status: accepted
Date: 2026-11-25

## Context

Issue #1255 gives Mesa a Logs tab that reads Google Cloud Logging: a team's services run on GKE, App Engine and Cloud Run across several GCP projects, with beta and prod told apart by cluster or service name. Mesa needs a way to read those entries, and Error Reporting's groups and log-based metrics' counts, as the person. Two ways exist:

- a source behind the Broker, as Atlassian sources are: an OAuth client Mesa owns, a sign-in through it, and a Google token kept in the profile's keys;
- the Google Cloud CLI the person already signed in with: `gcloud logging read <filter> --project <id> --format json`.

Whichever Mesa picks, every project's `mesa.yaml` and every person's sign-in follow it, so changing it later is a migration for everyone.

## Decision

- Mesa reads Cloud Logging only by running `gcloud logging read` (read-only) through the injected runner, as an argv, never a shell (`packages/core/src/logs/gcloud.ts`, `gcp.ts`). For the two reads gcloud has no command for, Error Reporting's group stats and Cloud Monitoring's time series of a log-based metric, it asks gcloud for a short-lived access token (`gcloud auth print-access-token`) on each call and sends it with that one REST request; the token is never stored. It has no Google OAuth client. Whatever account and project access the person's `gcloud` has is what Mesa can read; nothing more.
- The GCP projects and envs are company-wide, so they live in the profile's `config.yaml` (`logs.gcp: { projects, envs: { <name>: <filter> }, service }`, strict schema), never in Mesa's repository; each project is read in parallel with the same filter and the entries merged by time.
- Mesa never runs `gcloud auth` itself. Missing `gcloud`, no signed-in account and permission denied are each an error naming the fix (install the CLI, `gcloud auth login`); the app shows it with Copy.
- Ask sends the entries it reads to the agent's model through a `cloud-logs` Skill run in the General project, whose only tools are the read-only `mesa logs gcp`, `errors` and `counts`; emails and IP addresses are masked in what it reads (`logs.mask`, on by default). On an env named `prod` that is confirmed once per GCP project by a person (the app, or `--allow-prod` from a terminal outside a Mesa session), kept in the profile's `logs.prodAsk`. That, `logs.gcp` and `logs.mask` are refused from a Mesa window, as ADR-0013 refuses a project's scripts, so an agent cannot confirm prod, repoint the projects or turn masking off; and every Logging filter of a person's own is checked to be one balanced expression, so a view cannot escape the env, noise and time bounds it is joined with.

## Evidence

- No token stored: the Logs tab and `mesa logs gcp` only spawn `gcloud`; `logs/gcp.test.ts` checks the exact argv, and the profile's keys gain nothing.
- Google's review: reading Cloud Logging through OAuth needs the `logging.read` (or `cloud-platform`) scope, which Google lists as sensitive, so a Mesa OAuth client used by people outside its own organisation would need Google's OAuth app verification before it could ship. `gcloud` is Google's own client, already verified, and already signed in on the machines of the people who read these logs.
- Measured call time, 2026-11-25, on the owner's machine against a real project (names kept out of this repository): about 1.2 s for 5 entries, 1.8 to 2.7 s for 200 (five runs), about 2.5 s for a whole `mesa logs gcp --json` call of 200 entries, and about 7 s for an errors-only read of an hour at real volume (about 375 entries a second). Fast enough for a tab that reads on demand and pages back; too slow for live tailing, which is out of scope. So every filter runs server side, and Errors mode starts from Error Reporting's groups rather than reading entries.
- Log Analytics' SQL has no public API to run it with these credentials (docs/spikes/cloud-logs-analytics.md); counts over days come from log-based metrics instead.
- The three failures, read from `gcloud` itself: with `CLOUDSDK_CONFIG` pointed at an empty folder it prints "You do not currently have an active account selected ... gcloud auth login", and a project the account cannot read prints `PERMISSION_DENIED` or `USER_PROJECT_DENIED`; `gcloudError` maps each to its fix, checked in `logs/gcp.test.ts` and live.

## Consequences

- A person needs the Google Cloud CLI installed and signed in; the tab says so with the command to copy. A teammate with no access to a project sees permission denied, as in Google's own console.
- Mesa inherits `gcloud`'s speed and output format. A change to `gcloud logging read --format json` would break the parser; the fields read (`insertId`, `timestamp`, `severity`, `jsonPayload`, `textPayload`, `trace`) are the Logging API's own LogEntry fields.
- A Broker source for Google stays possible later, for people without `gcloud`, beside this rather than instead of it; the `logs.gcp` config would not change.
- Error Reporting and Cloud Monitoring are reached over REST with a token minted per call; an API answering 403 (not enabled, no role) falls back to grouping errors from a Logging read, or to counting the page read, with a note.

## Addendum, 2026-11-26: signing in from Mesa

The Logs tab reported "no signed-in account" while the same shell's `gcloud` worked. gcloud's own log (`~/.config/gcloud/logs`) on the owner's machine shows why: every failing call, `logging read` and `auth print-access-token` alike, ended with "There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution." The organisation's session policy asks for reauthentication, which gcloud can answer only at a terminal, and a terminal's gcloud then works. Twelve parallel `gcloud auth print-access-token` calls all succeeded with a valid token, so concurrency was not the cause. `gcloudError` matched "reauthenticat" and "refresh" under signed out. It now names the three causes apart (reauth, refresh failed, signed out), each with `action: login`.

- Each read mints one access token before its parallel gcloud calls, so they do not all refresh at once when the token has expired, and a sign-in failure is one error.
- Mesa may run two fixed commands for a person, never text taken from an error, and an agent in a Mesa window is refused both:
  - `gcloud auth login` (`mesa logs login`): it opens the browser, waits up to 3 minutes, and answers reauthentication too. It changes only the person's own gcloud sign-in, which they finish in the browser.
  - `gcloud services enable clouderrorreporting.googleapis.com --project <id>` (`mesa logs enable`): it changes the GCP project, so it runs only after a confirmation that names the project.
