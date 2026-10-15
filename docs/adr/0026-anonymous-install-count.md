# ADR-0026: Anonymous install count through the broker

Status: accepted
Date: 2026-10-14

## Context

The owner could not tell how many people use Mesa. GitHub's release download counts include the owner's own downloads, repeat downloads and update checks, and say nothing about unique people or who updates (#836, #837). Mesa promised "no analytics", and the broker (ADR-0014, ADR-0025) kept nothing but forwarded feedback. Counting installs means something about each Mac persists on a server, so it is recorded here. Usage analytics (which screens or features people use) is out of scope and would need its own decision.

## Decision

- **What is sent:** an install ID, Mesa's version and its update channel (`stable` or `beta`). The ID is a random UUID made on the Mac on first run, kept in `~/.mesa/install.json` for every profile, and tied to no hardware or account. Nothing else: no profile, project, session, path, name or usage.
- **When:** with core's update check (ADR-0018, at launch and every 4 hours), at most once a day; a failure is dropped and never fails the check. Development builds never send.
- **Off switch:** on by default, like Homebrew's analytics. `mesa installs off`, Settings > General, or `MESA_NO_INSTALL_PING=1` stops it. Turning it off sends `DELETE /installs/<id>`, so the broker erases that install.
- **The broker:** `POST /installs` and `DELETE /installs/<id>`, each 204 with no body; a malformed request is 400, more than 10 a minute from one IP 429 (binding `INSTALLS_LIMIT`, shared by both routes), a broker without the D1 binding 503 `not_configured`, and a store failure 500. IDs are kept lowercase. The IP decides the limit and is not kept, and no body is logged.
- **What is kept:** in the D1 database `mesa-installs`, `installs (id, first_seen, last_seen, version, channel)` and `install_versions (id, version, first_seen)`, days in UTC (`apps/broker/migrations/0001_installs.sql`). D1 over Analytics Engine because unique installs need the full history, and Analytics Engine keeps 3 months.
- **Reading it:** only the owner, with SQL in the Cloudflare dashboard or wrangler (`docs/installs.md`). Mesa has no stats screen.

## Evidence

- `apps/broker/src/broker.test.ts`: a ping keeps the install and each version by UTC day, running the migration and the store's SQL on SQLite; malformed pings keep nothing; an erase removes only that install; both routes answer 429 past the limit and 503 without D1; an uppercase ID is kept lowercase; a store failure is 500; the privacy page names what is kept and the off switch.

## Consequences

- The broker's privacy page says what the install count sends and keeps; with the app side (#837), the README and site say "no usage analytics" and name the install count.
- Anyone can post made-up IDs; the per-IP limit bounds it, and the counts are informational. A flood would mean removing the D1 binding (the routes answer 503).
- Deleting `~/.mesa/install.json` counts as a new install, and so does a reinstall on a wiped Mac.
