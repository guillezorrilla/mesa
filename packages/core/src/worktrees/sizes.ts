import { z } from 'zod';
import { changeJson, readCache } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { mapLimit } from '../lib/map-limit.js';
import type { Runner } from '../lib/process.js';

/** A checkout's size on disk, as a worktree row carries it: null when it could not be measured. */
export type WorktreeSize = { sizeBytes: number | null; sizeAt: string };

const Cache = z
  .record(z.string(), z.strictObject({ bytes: z.number().nullable(), at: z.string() }))
  .describe('worktree sizes');

/** How long a size, or a null one, is reused: 10 minutes. */
const FRESH_MS = 10 * 60_000;
/** How long `du` may take over one checkout, a large `node_modules` included. */
const DU_TIMEOUT_MS = 60_000;
/** How many `du` run at once, so a project with many worktrees does not flood the disk. */
const DU_AT_ONCE = 4;

/** Bytes from `du -sk`'s first field (kibibytes); undefined when it is not a number. */
export function duBytes(output: string): number | undefined {
  const kib = Number(output.trim().split(/\s+/)[0]);
  return output.trim() && Number.isFinite(kib) ? kib * 1024 : undefined;
}

/**
 * Each path's size on disk, `du -sk` over each, four side by side (60 s each), cached by path in `file`
 * for 10 minutes; `refresh` measures again regardless. A timeout, a missing folder or output that
 * is not a size gives null, cached the same 10 minutes, so a checkout too big for 60 s does not
 * hold up every list.
 */
export async function measureSizes(
  deps: LockDeps & { run: Runner },
  file: string,
  paths: readonly string[],
  refresh = false,
): Promise<Map<string, WorktreeSize>> {
  const now = deps.clock();
  // Read even on refresh: it drops a cache that does not read, which the write would refuse.
  const cached = readCache(file, Cache, {});
  const fresh = (path: string) => {
    const hit = refresh ? undefined : cached[path];
    return hit && now.getTime() - Date.parse(hit.at) < FRESH_MS ? hit : undefined;
  };
  const measured = await mapLimit(paths, DU_AT_ONCE, async (path) => {
    const hit = fresh(path);
    if (hit) return [path, { sizeBytes: hit.bytes, sizeAt: hit.at }] as const;
    const du = await deps.run('du', ['-sk', path], DU_TIMEOUT_MS);
    const bytes = du.ok ? duBytes(du.stdout) : undefined;
    return [path, { sizeBytes: bytes ?? null, sizeAt: now.toISOString() }] as const;
  });
  const sizes = new Map<string, WorktreeSize>(measured);
  const news = measured.filter(([path, size]) => size.sizeAt !== cached[path]?.at);
  if (news.length) {
    changeJson(
      file,
      Cache,
      (current = {}) => {
        // Forget sizes past their time, so the file holds only what a list could reuse.
        const kept = Object.fromEntries(
          Object.entries(current).filter(
            ([, size]) => now.getTime() - Date.parse(size.at) < FRESH_MS,
          ),
        );
        for (const [path, size] of news) kept[path] = { bytes: size.sizeBytes, at: size.sizeAt };
        return kept;
      },
      deps,
    );
  }
  return sizes;
}
