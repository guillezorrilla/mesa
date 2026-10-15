// Anonymous install counts (ADR-0026): one row per install, one per version it reached, in D1.
import type { Limit } from './feedback.js';

/** Where installs are kept: D1 in the Worker (d1Installs), SQLite in tests. */
export type InstallStore = {
  /** Records that install `id` ran `version` on `channel` on `day` (YYYY-MM-DD, UTC). */
  save: (install: Install, day: string) => Promise<void>;
  /** Erases every row of install `id`. */
  remove: (id: string) => Promise<void>;
};

/** What the routes need: the store (none on a broker without D1), the per-IP limit, the clock. */
export type Installs = { store?: InstallStore; limit: Limit; now: () => Date };

type Install = { id: string; version: string; channel: 'stable' | 'beta' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION_MAX = 40;

/** The ping's fields, or undefined when one is missing or malformed. */
function parse(body: unknown): Install | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { id, version, channel } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID.test(id)) return undefined;
  if (typeof version !== 'string' || !version || version.length > VERSION_MAX) return undefined;
  if (channel !== 'stable' && channel !== 'beta') return undefined;
  return { id, version, channel };
}

/**
 * `POST /installs` records an install ping, `DELETE /installs/<id>` erases one; both answer 204
 * with no body. The caller's IP decides the limit and is never kept.
 */
export async function installsRoute(
  request: Request,
  path: string,
  installs: Installs,
): Promise<[status: number, body?: unknown]> {
  const del = request.method === 'DELETE' ? path.match(/^\/installs\/([^/]+)$/)?.[1] : undefined;
  if (!(path === '/installs' && request.method === 'POST') && del === undefined)
    return [404, { error: 'not_found' }];
  if (!(await installs.limit(request.headers.get('cf-connecting-ip') ?? 'unknown')))
    return [429, { error: 'rate_limited' }];
  if (!installs.store) return [503, { error: 'not_configured' }];
  if (del !== undefined) {
    if (!UUID.test(del)) return [400, { error: 'bad_request' }];
    await installs.store.remove(del);
    return [204];
  }
  const install = parse(await request.json().catch(() => undefined));
  if (!install) return [400, { error: 'bad_request' }];
  await installs.store.save(install, installs.now().toISOString().slice(0, 10));
  return [204];
}

/** The part of D1's API the store uses, so the broker needs no Cloudflare types. */
export type D1 = {
  prepare: (sql: string) => { bind: (...values: unknown[]) => unknown };
  batch: (statements: unknown[]) => Promise<unknown>;
};

/** The store over the Worker's D1 binding; the tables are migrations/0001_installs.sql. */
export const d1Installs = (db: D1): InstallStore => ({
  save: async ({ id, version, channel }, day) => {
    await db.batch([
      db
        .prepare(
          `INSERT INTO installs (id, first_seen, last_seen, version, channel) VALUES (?1, ?2, ?2, ?3, ?4)
           ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen, version = excluded.version, channel = excluded.channel`,
        )
        .bind(id, day, version, channel),
      db
        .prepare(
          'INSERT OR IGNORE INTO install_versions (id, version, first_seen) VALUES (?1, ?2, ?3)',
        )
        .bind(id, version, day),
    ]);
  },
  remove: async (id) => {
    await db.batch([
      db.prepare('DELETE FROM install_versions WHERE id = ?1').bind(id),
      db.prepare('DELETE FROM installs WHERE id = ?1').bind(id),
    ]);
  },
});
