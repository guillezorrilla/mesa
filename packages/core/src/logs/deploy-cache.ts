import { z } from 'zod';
import { changeJson, readCache } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { CloudDeploys } from './deploys.js';

// Each range's deploys kept a short while (CONTEXT.md, Cloud Logs, Deploys), so a chart redrawn or
// Ask asked again runs no gcloud: two minutes for a clean read, one for a read with notes, so a
// source that keeps failing is not asked again on every redraw but is retried soon.

const Note = z.object({
  project: z.string(),
  message: z.string(),
  fix: z.string().optional(),
  action: z.enum(['login', 'enable']).optional(),
});
const Deploy = z.strictObject({
  project: z.string(),
  service: z.string(),
  revision: z.string(),
  at: z.string(),
  source: z.enum(['cloud-run', 'app-engine', 'logs']),
});
const Cache = z
  .record(
    z.string(),
    z.strictObject({ at: z.string(), deploys: z.array(Deploy), notes: z.array(Note) }),
  )
  .describe('Cloud Logs deploys');

const FRESH_MS = 2 * 60_000;
const FAILED_MS = 60_000;

const fresh = (kept: { at: string; notes: unknown[] }, now: number) =>
  now - Date.parse(kept.at) < (kept.notes.length ? FAILED_MS : FRESH_MS);

/** `key`'s deploys from `file` while fresh, else `read`'s, kept with only the ranges still fresh. */
export async function cachedDeploys(
  cache: { file: string; lock: LockDeps } | undefined,
  key: string,
  now: number,
  read: () => Promise<CloudDeploys>,
): Promise<CloudDeploys> {
  if (!cache) return read();
  const hit = readCache(cache.file, Cache, {})[key];
  if (hit && fresh(hit, now)) return { deploys: hit.deploys, notes: hit.notes };
  const found = await read();
  changeJson(
    cache.file,
    Cache,
    (current = {}) => ({
      ...Object.fromEntries(Object.entries(current).filter(([, kept]) => fresh(kept, now))),
      [key]: { at: new Date(now).toISOString(), ...found },
    }),
    cache.lock,
  );
  return found;
}
