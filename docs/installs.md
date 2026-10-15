# Install counts

The broker keeps anonymous installs in the D1 database `mesa-installs` (ADR-0026). Run a query in the Cloudflare dashboard (Storage & Databases > D1 > mesa-installs > Console), or from `apps/broker`:

```sh
pnpm exec wrangler d1 execute mesa-installs --remote --command "<query>"
```

Days are UTC dates (`YYYY-MM-DD`).

Unique installs ever:

```sql
SELECT COUNT(*) AS installs FROM installs;
```

Installs active in the last 7 and 30 days:

```sql
SELECT
  SUM(last_seen >= date('now', '-7 days')) AS active_7d,
  SUM(last_seen >= date('now', '-30 days')) AS active_30d
FROM installs;
```

Active installs per version, and per channel:

```sql
SELECT version, channel, COUNT(*) AS installs
FROM installs
WHERE last_seen >= date('now', '-30 days')
GROUP BY version, channel
ORDER BY installs DESC;
```

New installs per week:

```sql
SELECT strftime('%Y-W%W', first_seen) AS week, COUNT(*) AS new_installs
FROM installs
GROUP BY week
ORDER BY week;
```

How many installs reached a version, and how many days after its first install did:

```sql
SELECT version,
  COUNT(*) AS installs,
  MIN(first_seen) AS first_day,
  ROUND(AVG(julianday(first_seen) - julianday((SELECT MIN(first_seen) FROM install_versions v2 WHERE v2.version = v.version))), 1) AS avg_days_after_first
FROM install_versions v
GROUP BY version
ORDER BY first_day DESC;
```

Installs that updated at least once:

```sql
SELECT COUNT(*) AS updated FROM (SELECT id FROM install_versions GROUP BY id HAVING COUNT(*) > 1);
```
