// Anonymous install counts (ADR-0026): the routes that record and erase an install.
import { callerKey, type Limit } from './limit.js';

type Install = { id: string; version: string; channel: 'stable' | 'beta' };

/** Where installs are kept: D1 in the Worker (installs-d1.ts), SQLite in tests. */
export type InstallStore = {
  /** Records that install `id` ran `version` on `channel` on `day` (YYYY-MM-DD, UTC). */
  save: (install: Install, day: string) => Promise<void>;
  /** Erases every row of install `id`. */
  remove: (id: string) => Promise<void>;
};

/** What the routes need on a broker that keeps installs: the store, the per-IP limit, the clock. */
export type InstallsDeps = { store: InstallStore; limit: Limit; now: () => Date };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_MAX = 40;

/** The ping's fields, the id lowercased, or undefined when one is missing or malformed. */
function parse(body: unknown): Install | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { id, version, channel } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID.test(id)) return undefined;
  if (typeof version !== 'string' || !version.trim() || version.length > VERSION_MAX)
    return undefined;
  if (channel !== 'stable' && channel !== 'beta') return undefined;
  return { id: id.toLowerCase(), version, channel };
}

/**
 * `POST /installs` records an install ping, `DELETE /installs/<id>` erases one; both answer 204
 * with no body. Without `deps` (no D1 bound) they answer 503; a store failure is 500.
 */
export async function installsRoute(
  request: Request,
  path: string,
  deps: InstallsDeps | undefined,
): Promise<[status: number, body?: unknown]> {
  const erasing =
    request.method === 'DELETE' ? path.match(/^\/installs\/([^/]+)$/)?.[1] : undefined;
  if (!(path === '/installs' && request.method === 'POST') && erasing === undefined)
    return [404, { error: 'not_found' }];
  if (!deps) return [503, { error: 'not_configured' }];
  if (!(await deps.limit(callerKey(request)))) return [429, { error: 'rate_limited' }];
  try {
    if (erasing !== undefined) {
      if (!UUID.test(erasing)) return [400, { error: 'bad_request' }];
      await deps.store.remove(erasing.toLowerCase());
      return [204];
    }
    const install = parse(await request.json().catch(() => undefined));
    if (!install) return [400, { error: 'bad_request' }];
    await deps.store.save(install, deps.now().toISOString().slice(0, 10));
    return [204];
  } catch {
    return [500, { error: 'store_failed' }];
  }
}
