import { realpathSync, statSync } from 'node:fs';
import { MesaError } from '../lib/result.js';
import { registerProject } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { joinWarnings } from '../receipts/recorder.js';
import { type AdoptDeps, adoptSession } from './adopt.js';
import { type DiscoveryDeps, discoverNative } from './discovery.js';

// First-run discovery's bulk (CONTEXT.md, First-run discovery): one project folder registered,
// and the native conversations discovery places in it adopted as resumable sessions.

/** One session adopted from a native conversation. */
export type DiscoveredAdoption = {
  id: string;
  agentSessionId: string;
  agent: 'claude' | 'codex';
  name?: string;
};
export type DiscoveryAdoption = {
  /** The project's name. */
  project: string;
  /** Whether this run registered it. */
  registered: boolean;
  /** Past conversations, recorded only. */
  adopted: DiscoveredAdoption[];
  /** Running sessions, reopened in Mesa windows (`live`). */
  reopened: DiscoveredAdoption[];
  failed: { agentSessionId: string; reason: string }[];
  /** The adoption warning, when a running session was reopened. */
  warning?: string;
};

/**
 * Registers folder `path` unless registered (a minimal mesa.yaml when it has none), then adopts,
 * record-only, every conversation of the last `days` that discoverNative places in it, each under
 * its native name; with `live`, also its running sessions, reopened in Mesa windows. One failing
 * adoption is reported in `failed` and the rest go on; held conversations are not found again, so
 * a second run adopts nothing new.
 */
export async function adoptDiscovered(
  deps: AdoptDeps & DiscoveryDeps,
  input: { path: string; days: number; live?: boolean },
): Promise<DiscoveryAdoption> {
  if (!statSync(input.path, { throwIfNoEntry: false })?.isDirectory()) {
    throw new MesaError('not_found', `${input.path} is not a folder`);
  }
  const path = realpathSync(input.path);
  // One listing and one read of the other profiles for the whole batch.
  const listing = deps.listing();
  const elsewhere = deps.elsewhere();
  const batch = { ...deps, listing: () => listing, elsewhere: () => elsewhere };
  const found = await discoverNative(batch, { days: input.days, folder: path });
  const known = readRegistry(deps.profile.paths.registry).find((e) => e.path === path);
  const project =
    known?.name ?? registerProject(deps.profile, { dir: path, create: true }).project.name;

  const failed: DiscoveryAdoption['failed'] = [];
  const warnings: string[] = [];
  const adopt = async (
    rows: readonly { agent: 'claude' | 'codex'; id: string }[],
    resume: boolean,
  ) => {
    const done: DiscoveredAdoption[] = [];
    for (const { agent, id } of rows) {
      try {
        const { record, warning } = await adoptSession(batch, {
          agentSessionId: id,
          project,
          noResume: !resume,
        });
        done.push({
          id: record.id,
          agentSessionId: id,
          agent,
          ...(record.name && { name: record.name }),
        });
        if (resume) warnings.push(warning);
      } catch (error) {
        failed.push({ agentSessionId: id, reason: (error as Error).message });
      }
    }
    return done;
  };
  const adopted = await adopt(found.conversations, false);
  const reopened = input.live ? await adopt(found.live, true) : [];
  const warning = joinWarnings(...new Set(warnings));
  return {
    project,
    registered: known === undefined,
    adopted,
    reopened,
    failed,
    ...(warning ? { warning } : {}),
  };
}
