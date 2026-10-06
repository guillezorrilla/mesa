import { claudeTranscripts } from '../agents/claude/paths.js';
import { claudeHistory } from '../agents/claude/transcripts.js';
import { codexHistory } from '../agents/codex/rollouts.js';
import type { Env } from '../lib/process.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { withName } from './native-name.js';
import type { SessionStore } from './store.js';

/** A bounded view of native conversations; Mesa never copies or edits their transcripts. */
export type NativeHistoryRow = {
  agent: 'claude' | 'codex';
  id: string;
  cwd: string;
  updatedAt: string;
  /** Its native name (native-name.ts), when it has one. */
  name?: string;
  importedAs?: string;
  heldElsewhere?: true;
};
export type NativeHistory = {
  rows: NativeHistoryRow[];
  total: number;
  unsupported: { agent: 'antigravity'; reason: string }[];
};

const LIMIT = 100;
/** The agents whose native conversations Mesa cannot list, and why. */
export const UNSUPPORTED_HISTORY = [
  { agent: 'antigravity' as const, reason: 'No qualified native CLI history source' },
];

/** Latest native conversations for a registered project, including those Mesa has not imported. */
export type NativeHistoryDeps = {
  profile: Profile;
  store: SessionStore;
  home: string;
  env: Env;
  elsewhere: () => ReadonlySet<string>;
};

export function nativeHistory(deps: NativeHistoryDeps, project: string): NativeHistory {
  const root = findProject(deps.profile, project).path;
  const imported = new Map(
    deps.store
      .list()
      .flatMap((record) =>
        record.agentSessionId ? [[record.agentSessionId, record.id] as const] : [],
      ),
  );
  const elsewhere = deps.elsewhere();
  const rows = [
    ...claudeHistory(claudeTranscripts(deps.home, deps.env)),
    ...codexHistory({ home: deps.home, env: deps.env }),
  ]
    .filter((row) => row.cwd === root || row.cwd.startsWith(`${root}/`))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    rows: rows.slice(0, LIMIT).map((row) => ({
      agent: row.agent,
      id: row.id,
      cwd: row.cwd,
      updatedAt: row.updatedAt,
      ...withName(deps, row),
      ...(imported.has(row.id) ? { importedAs: imported.get(row.id) } : {}),
      ...(elsewhere.has(row.id) ? { heldElsewhere: true as const } : {}),
    })),
    total: rows.length,
    unsupported: UNSUPPORTED_HISTORY,
  };
}
