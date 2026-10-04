import { claudeTranscripts } from '../agents/claude/paths.js';
import { claudeHistory } from '../agents/claude/transcripts.js';
import { codexHistory } from '../agents/codex/rollouts.js';
import type { Clock } from '../lib/clock.js';
import type { Env } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type ProjectCandidate, projectCandidate } from '../projects/discover.js';
import { projectFolder } from '../projects/project-folder.js';
import { readRegistry } from '../projects/registry.js';
import type { AgentProcess } from './agent-listing.js';
import { UNSUPPORTED_HISTORY } from './history.js';
import { withName } from './native-name.js';
import type { SessionStore } from './store.js';

// What runs and ran on this machine outside Mesa, machine-wide: the project folders native
// conversations ran in, the running sessions no profile holds, and the recent conversations.
// Read only: nothing is recorded (CONTEXT.md, Adopted session).

/** A folder native conversations ran in, as a project candidate. */
export type NativeProject = ProjectCandidate & {
  registered: boolean;
  conversations: number;
  live: number;
};
export type NativeLive = {
  agent: 'claude' | 'codex';
  id: string;
  cwd: string;
  /** Its project folder (projectFolder), none when it has none. */
  project: string | null;
  name?: string;
  status?: string;
};
export type NativeConversation = {
  agent: 'claude' | 'codex';
  id: string;
  cwd: string;
  project: string | null;
  updatedAt: string;
  name?: string;
};
export type NativeDiscovery = {
  since: string;
  days: number;
  projects: NativeProject[];
  live: NativeLive[];
  conversations: NativeConversation[];
  total: number;
  /** Of `total`, those in no project folder: all of them, not only the ones listed. */
  unplaced: number;
  truncated: boolean;
  unsupported: typeof UNSUPPORTED_HISTORY;
};

export type DiscoveryDeps = {
  profile: Profile;
  store: SessionStore;
  home: string;
  env: Env;
  clock: Clock;
  /** The live agent sessions (listAgentProcesses). */
  listing: () => Promise<AgentProcess[]>;
  /** Agent session ids other profiles' records hold. */
  elsewhere: () => ReadonlySet<string>;
};

const LIMIT = 300;
/** How many days back discovery looks unless asked (mesa discover, the first-run offer). */
export const DISCOVERY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const listed = (p: AgentProcess): p is AgentProcess & { agent: 'claude' | 'codex' } =>
  (p.agent === 'claude' || p.agent === 'codex') && p.nativeState !== 'stopped';

/**
 * The project folders, running sessions, and conversations of the last `days` (1 to 365) found on
 * this machine that no session of this or another profile holds, only project folder `folder`'s
 * when given. Names are read only for the rows returned; at most 300 conversations, newest first,
 * `truncated` past that.
 */
export async function discoverNative(
  deps: DiscoveryDeps,
  { days, folder }: { days: number; folder?: string },
): Promise<NativeDiscovery> {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new MesaError('usage', `days must be a whole number from 1 to 365, not ${days}`);
  }
  const since = new Date(deps.clock().getTime() - days * DAY_MS).toISOString();
  const held = new Set([
    ...deps.store.list().flatMap((r) => (r.agentSessionId ? [r.agentSessionId] : [])),
    ...deps.elsewhere(),
  ]);
  const running = (await deps.listing()).filter(listed);
  const live = new Set(running.map((p) => p.agentSessionId));
  const history = [...claudeHistory(claudeTranscripts(deps.home)), ...codexHistory(deps)];
  const files = new Map(history.flatMap((row) => ('file' in row ? [[row.id, row.file]] : [])));
  // Conversations share folders: each is looked up once.
  const folders = new Map<string, string | null>();
  const folderOf = (cwd: string) => {
    if (!folders.has(cwd)) folders.set(cwd, projectFolder(deps.home, cwd));
    return folders.get(cwd) ?? null;
  };
  const wanted = (cwd: string) => folder === undefined || folderOf(cwd) === folder;
  const recent = history
    .filter(
      (row) => row.updatedAt >= since && !live.has(row.id) && !held.has(row.id) && wanted(row.cwd),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const named = (c: { agent: 'claude' | 'codex'; id: string }) =>
    withName(deps, { ...c, file: files.get(c.id) });

  const liveRows = running
    .filter((p) => !held.has(p.agentSessionId) && wanted(p.cwd))
    .map((p) => ({
      agent: p.agent,
      id: p.agentSessionId,
      cwd: p.cwd,
      project: folderOf(p.cwd),
      ...named({ agent: p.agent, id: p.agentSessionId }),
      ...(p.status ? { status: p.status } : {}),
    }));
  const projects = new Map<string, NativeProject>();
  const registered = new Set(readRegistry(deps.profile.paths.registry).map((e) => e.path));
  const count = (at: string | null, key: 'conversations' | 'live') => {
    if (at === null) return;
    let row = projects.get(at);
    if (!row) {
      const candidate = projectCandidate(at);
      if (!candidate) return;
      row = { ...candidate, registered: registered.has(at), conversations: 0, live: 0 };
      projects.set(at, row);
    }
    row[key]++;
  };
  for (const row of liveRows) count(row.project, 'live');
  for (const row of recent) count(folderOf(row.cwd), 'conversations');

  return {
    since,
    days,
    projects: [...projects.values()],
    live: liveRows,
    conversations: recent.slice(0, LIMIT).map((row) => ({
      agent: row.agent,
      id: row.id,
      cwd: row.cwd,
      project: folderOf(row.cwd),
      updatedAt: row.updatedAt,
      ...named(row),
    })),
    total: recent.length,
    unplaced: recent.filter((row) => folderOf(row.cwd) === null).length,
    truncated: recent.length > LIMIT,
    unsupported: UNSUPPORTED_HISTORY,
  };
}
