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
import { nativePrompt } from './native-prompt.js';
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
  /** Its first prompt, on one line (native-prompt.ts): what shows when it has no name. */
  prompt?: string;
  /** When its transcript or rollout was last written. */
  updatedAt?: string;
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

/** `deps` with its listing and the other profiles read once, however often a batch asks. */
export function readOnce<D extends Pick<DiscoveryDeps, 'listing' | 'elsewhere'>>(deps: D): D {
  const listing = deps.listing();
  const elsewhere = deps.elsewhere();
  return { ...deps, listing: () => listing, elsewhere: () => elsewhere };
}

/** The agent session ids of the running Claude Code and Codex sessions (the listing). */
export const runningIds = async (deps: Pick<DiscoveryDeps, 'listing'>) =>
  new Set((await deps.listing()).filter(listed).map((p) => p.agentSessionId));

/** Agent session ids a session of this or another profile holds. */
const heldIds = (deps: DiscoveryDeps) =>
  new Set([
    ...deps.store.list().flatMap((r) => (r.agentSessionId ? [r.agentSessionId] : [])),
    ...deps.elsewhere(),
  ]);

/**
 * What one scan reads once and shares: the agent session ids held, each cwd's project folder
 * (projectFolder, each folder looked up once), and a conversation's native name, through its
 * Claude Code transcript in `files` when the scan found it.
 */
type Scan = {
  held: ReadonlySet<string>;
  folderOf: (cwd: string) => string | null;
  named: (c: { agent: 'claude' | 'codex'; id: string }) => { name?: string };
};

function scanOf(deps: DiscoveryDeps, files: ReadonlyMap<string, string> = new Map()): Scan {
  const placed = new Map<string, string | null>();
  return {
    held: heldIds(deps),
    folderOf: (cwd) => {
      if (!placed.has(cwd)) placed.set(cwd, projectFolder(deps.home, cwd));
      return placed.get(cwd) ?? null;
    },
    named: (c) => withName(deps, { ...c, file: files.get(c.id) }),
  };
}

/**
 * The running Claude Code and Codex sessions no session of this or another profile holds, each in
 * its project folder (projectFolder), with its native name, first prompt and last write, only
 * those in `folders` when given. Reads only their own transcript or rollout heads.
 */
export async function nativeLive(
  deps: DiscoveryDeps,
  folders?: readonly string[],
  scan = scanOf(deps),
): Promise<NativeLive[]> {
  return (await deps.listing()).filter(listed).flatMap((p) => {
    const project = scan.folderOf(p.cwd);
    if (scan.held.has(p.agentSessionId) || (folders && !folders.includes(project ?? ''))) return [];
    return [
      {
        agent: p.agent,
        id: p.agentSessionId,
        cwd: p.cwd,
        project,
        ...scan.named({ agent: p.agent, id: p.agentSessionId }),
        ...nativePrompt(deps, { agent: p.agent, id: p.agentSessionId }),
        ...(p.status ? { status: p.status } : {}),
      },
    ];
  });
}

/**
 * One scan of the last `days` (1 to 365): the conversations no session of this or another profile
 * holds and none runs, only those in project folders `folders` when given, newest first and not
 * yet named, and the running sessions (nativeLive). Transcripts and rollouts last written before
 * then are not opened.
 */
async function scanNative(
  deps: DiscoveryDeps,
  { days, folders }: { days: number; folders?: readonly string[] },
) {
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new MesaError('usage', `days must be a whole number from 1 to 365, not ${days}`);
  }
  const start = deps.clock().getTime() - days * DAY_MS;
  const once = readOnce(deps);
  const running = await runningIds(once);
  const history = [
    ...claudeHistory(claudeTranscripts(deps.home), start),
    ...codexHistory(deps, start),
  ];
  const scan = scanOf(
    once,
    new Map(history.flatMap((row) => ('file' in row ? [[row.id, row.file]] : []))),
  );
  const wanted = (cwd: string) =>
    folders === undefined || folders.includes(scan.folderOf(cwd) ?? '');
  const recent = history
    .filter((row) => !running.has(row.id) && !scan.held.has(row.id) && wanted(row.cwd))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const conversation = (row: (typeof recent)[number]): NativeConversation => ({
    agent: row.agent,
    id: row.id,
    cwd: row.cwd,
    project: scan.folderOf(row.cwd),
    updatedAt: row.updatedAt,
    ...scan.named(row),
  });
  return { start, scan, recent, conversation, live: await nativeLive(once, folders, scan) };
}

/**
 * Every conversation and running session one scan of the last `days` finds in project folders
 * `folders`, each with its native name: what adoption takes, past the 300 discoverNative lists.
 */
export async function nativeInFolders(
  deps: DiscoveryDeps,
  input: { days: number; folders: readonly string[] },
): Promise<Pick<NativeDiscovery, 'live' | 'conversations'>> {
  const { recent, conversation, live } = await scanNative(deps, input);
  return { live, conversations: recent.map(conversation) };
}

/**
 * The project folders, running sessions, and conversations of the last `days` (1 to 365) found on
 * this machine that no session of this or another profile holds (scanNative), only those in
 * project folders `folders` when given. Names are read only for the rows returned; at most 300
 * conversations, newest first, `truncated` past that.
 */
export async function discoverNative(
  deps: DiscoveryDeps,
  input: { days: number; folders?: readonly string[] },
): Promise<NativeDiscovery> {
  const { start, scan, recent, conversation, live } = await scanNative(deps, input);
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
  for (const row of live) count(row.project, 'live');
  for (const row of recent) count(scan.folderOf(row.cwd), 'conversations');

  return {
    since: new Date(start).toISOString(),
    days: input.days,
    projects: [...projects.values()],
    live,
    conversations: recent.slice(0, LIMIT).map(conversation),
    total: recent.length,
    unplaced: recent.filter((row) => scan.folderOf(row.cwd) === null).length,
    truncated: recent.length > LIMIT,
    unsupported: UNSUPPORTED_HISTORY,
  };
}
