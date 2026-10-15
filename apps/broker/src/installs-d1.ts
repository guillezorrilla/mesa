// The install count's D1 store (ADR-0026); its tables are migrations/0001_installs.sql.
import type { InstallStore } from './installs.js';

/** The part of D1's API the store uses, so the broker needs no Cloudflare types. */
export type D1 = {
  prepare: (sql: string) => { bind: (...values: unknown[]) => unknown };
  batch: (statements: unknown[]) => Promise<unknown>;
};

/** The store over the Worker's D1 binding; each call is one batch, which D1 runs as a transaction. */
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
