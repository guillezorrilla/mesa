# Spike: counts over days through Log Analytics

Date: 2026-11-25. Issue #1255, Owner update 3.

## Question

Can Mesa run counts over days server side (for example 5xx per context field per day for a week) through Log Analytics on a log bucket with analytics enabled, using only the person's gcloud credentials? What is the call, its latency and its cost? Ask uses it only if the answer is yes.

## What was tried

Against a real production GCP project the owner's gcloud can read (read-only; its name and content are not kept here):

1. `gcloud logging buckets list --project <p> --format json`: the `_Default` and `_Required` buckets both have `analyticsEnabled: true`.
2. The Cloud Logging API's discovery document (`https://www.googleapis.com/discovery/v1/apis/logging/v2/rest`), searched for any method whose name or path holds `query`: there is none. The only Log Analytics shapes are `OpsAnalyticsQuery`, `SavedQuery` and `RecentQuery`, which store a query; nothing runs one.
3. A guessed `POST https://logging.googleapis.com/v2/entries:queryData` with a SQL count over `_Default._AllLogs` and gcloud's access token: HTTP 404 in 0.33 s.
4. `gcloud logging links list --bucket _Default --location global --project <p>`: no linked BigQuery dataset.

## Outcome

**No, not with the person's credentials alone, as things stand.** Log Analytics runs SQL in the console, but Google exposes no public API that runs it. The supported route is a BigQuery dataset linked to the bucket: someone with the right role creates it once (`gcloud logging links create <id> --bucket _Default --location global`, a write, so not done here), and then `bq query` runs the SQL with the person's own credentials, billed as BigQuery on-demand queries by bytes scanned (a `bq query --dry_run` shows the bytes for free first).

So:

- Ask does not use Log Analytics. Its counts over time come from log-based metrics through Cloud Monitoring (`mesa logs counts`), which are server side, already kept for days, and free to read; views imported from the metrics (`mesa logs views import-metrics`) map to them.
- A follow-up could offer the linked-dataset route for a project that has one: detect a link with `gcloud logging links list`, then run `bq query --use_legacy_sql=false` with a dry run first to show the cost. That needs a person to create the link, and an ADR, as it adds BigQuery spend.

## Numbers

| Call | Latency |
| --- | --- |
| `gcloud logging buckets list` | about 1 s |
| `entries:queryData` (guessed) | 0.33 s, HTTP 404 |
| `gcloud logging read`, errors only, 1 h, real volume (owner's measure) | about 7 s |
