import { realpathSync, statSync } from 'node:fs';
import { MesaError } from '../lib/result.js';
import { projectFolder } from '../projects/project-folder.js';
import { projectOf, registerProject } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { joinWarnings } from '../receipts/recorder.js';
import { type AdoptDeps, adoptSession, nativeConversation } from './adopt.js';
import {
  type DiscoveryDeps,
  type NativeLive,
  nativeInFolders,
  nativeLive,
  readOnce,
  runningIds,
} from './discovery.js';

// First-run discovery's bulk (CONTEXT.md, First-run discovery): project folders registered, and
// the native conversations discovery places in each adopted as resumable sessions.

/** One session adopted from a native conversation. */
export type DiscoveredAdoption = {
  id: string;
  agentSessionId: string;
  agent: 'claude' | 'codex';
  name?: string;
  /**
   * The registered project its cwd is in, when not the folder's (a linked worktree registered as
   * its own project): it is adopted there, as `mesa adopt` would place it.
   */
  project?: string;
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
 * A conversation or running session to adopt, as discovery found it: `name` null when its name
 * was read and it has none, absent when it was not read.
 */
type Found = { agent: 'claude' | 'codex'; id: string; cwd: string; name?: string | null };
type Failed = DiscoveryAdoption['failed'][number];

/**
 * For each folder of `paths`, in order: registers it unless registered (a minimal mesa.yaml when
 * it has none), then adopts, record-only, its conversations: those of `ids` (given for one
 * folder), each looked up on its own, a running one only reopened with `live`, else every
 * conversation of the last `days` that one scan (nativeInFolders), shared by all the folders,
 * places in it. Each is adopted under its native name and in the registered project its cwd is in
 * (`mesa adopt`'s), else the folder's; with `live`, the folder's running sessions too, reopened in
 * Mesa windows. One failing adoption, or an id that is no native conversation in the folder, is
 * reported in `failed` and the rest go on; held conversations are not found again, so a second run
 * adopts nothing new. A path that is not a folder refuses all.
 */
export async function adoptDiscovered(
  deps: AdoptDeps & DiscoveryDeps,
  input: { paths: readonly string[]; days: number; live?: boolean; ids?: readonly string[] },
): Promise<DiscoveryAdoption[]> {
  const folders = input.paths.map((path) => {
    if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) {
      throw new MesaError('not_found', `${path} is not a folder`);
    }
    return realpathSync(path);
  });
  const batch = readOnce(deps);
  const scan = input.ids ? undefined : await nativeInFolders(batch, { days: input.days, folders });
  const running = input.ids ? await runningIds(batch) : new Set<string>();
  const done: DiscoveryAdoption[] = [];
  for (const path of folders) {
    const failed: Failed[] = [];
    const live = !input.live
      ? []
      : read(scan ? scan.live.filter((s) => s.project === path) : await nativeLive(batch, [path]));
    const reopened = new Set(live.map((s) => s.id));
    const conversations = scan
      ? read(scan.conversations.filter((c) => c.project === path))
      : (input.ids ?? []).flatMap((id) => {
          // A running session is only reopened (`live`), never recorded as a past conversation.
          if (reopened.has(id)) return [];
          const row =
            running.has(id) && !input.live
              ? { agentSessionId: id, reason: `${id} is running: pass --live to reopen it` }
              : conversationIn(deps, path, id);
          if ('reason' in row) failed.push(row);
          return 'reason' in row ? [] : [row];
        });
    done.push(await adoptInto(batch, path, { conversations, live, failed }));
  }
  return done;
}

/** Rows discovery read names for: one with none has `name` null, so it is not read again. */
const read = (rows: readonly Pick<NativeLive, 'agent' | 'id' | 'cwd' | 'name'>[]): Found[] =>
  rows.map(({ agent, id, cwd, name }) => ({ agent, id, cwd, name: name ?? null }));

/** Native conversation `id`, read on its own, when it ran in project folder `path`. */
function conversationIn(deps: DiscoveryDeps, path: string, id: string): Found | Failed {
  const ran = nativeConversation(deps, id);
  if (!ran) {
    return {
      agentSessionId: id,
      reason: `${id} is not a Claude Code or Codex conversation on this machine`,
    };
  }
  if (projectFolder(deps.home, ran.cwd) !== path) {
    return { agentSessionId: id, reason: `${id} ran in ${ran.cwd}, outside ${path}` };
  }
  return { id, ...ran };
}

/** Registers folder `path` unless registered and adopts what was found in it. */
async function adoptInto(
  deps: AdoptDeps,
  path: string,
  found: { conversations: readonly Found[]; live: readonly Found[]; failed: Failed[] },
): Promise<DiscoveryAdoption> {
  const before = readRegistry(deps.profile.paths.registry);
  const known = before.find((e) => e.path === path);
  const project =
    known?.name ?? registerProject(deps.profile, { dir: path, create: true }).project.name;
  // Read again only when this run registered the folder.
  const registry = known ? before : readRegistry(deps.profile.paths.registry);
  const { failed } = found;
  const warnings: string[] = [];
  const adopt = async (rows: readonly Found[], resume: boolean) => {
    const done: DiscoveredAdoption[] = [];
    for (const { agent, id, cwd, name } of rows) {
      try {
        // Where it ran and its native name, as discovery read them, not read again. adoptSession
        // refuses a project its cwd is not in, so the cwd's comes first.
        const { record, warning } = await adoptSession(deps, {
          agentSessionId: id,
          project: projectOf(cwd, registry) ?? project,
          noResume: !resume,
          ran: { agent, cwd },
          ...(name !== undefined && { name }),
        });
        done.push({
          id: record.id,
          agentSessionId: id,
          agent,
          ...(record.name && { name: record.name }),
          ...(record.project !== project && { project: record.project }),
        });
        if (resume) warnings.push(warning);
      } catch (error) {
        failed.push({ agentSessionId: id, reason: (error as Error).message });
      }
    }
    return done;
  };
  const adopted = await adopt(found.conversations, false);
  const reopened = await adopt(found.live, true);
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
