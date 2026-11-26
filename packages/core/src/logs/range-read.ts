import type { LockDeps } from '../lib/lock-file.js';
import { cloudDeploys } from './deploys.js';
import { cloudErrors, type ErrorDeps } from './errors.js';
import type { CloudQuery } from './gcp.js';
import type { GcpLogs } from './gcp-config.js';
import { maskErrors } from './mask.js';
import type { RangeFacts } from './range-summary.js';
import { cloudVolume } from './volume.js';

// What Ask reads of its whole range (CONTEXT.md, Ask (logs)) beside the page of entries: the error
// groups, the counts by severity and service, and the deploys, read at once; one that fails is a
// note in the summary (range-summary.ts), never the Ask's error.

/** Why a read failed, as the summary notes it. */
const failed = (error: unknown) => ({
  failed: error instanceof Error ? error.message : String(error),
});

/**
 * The facts of `query`'s whole range (it names its env): its error groups (masked with `mask`),
 * its log_entry_count by severity and service, and its deploys (kept in `deployCache`).
 */
export async function readRange(
  deps: ErrorDeps,
  config: GcpLogs,
  query: CloudQuery,
  opts: { mask: boolean; deployCache: { file: string; lock: LockDeps } },
): Promise<RangeFacts> {
  const [errors, volume, deploys] = await Promise.all([
    cloudErrors(deps, config, query).then(
      (found) => ({ groups: opts.mask ? maskErrors(found).groups : found.groups }),
      failed,
    ),
    cloudVolume(deps, config, query).catch(failed),
    cloudDeploys(
      deps,
      config,
      { env: query.env, projects: query.projects, services: query.services, since: query.since },
      opts.deployCache,
    ).catch(failed),
  ]);
  return { since: query.since ?? '1h', errors, volume, deploys };
}
