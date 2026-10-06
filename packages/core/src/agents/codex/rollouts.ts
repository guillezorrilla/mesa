import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { fileHead } from '../../lib/file-head.js';
import type { Env } from '../../lib/process.js';
import { codexHome, codexSessions } from './paths.js';

// Codex's rollouts, one JSONL file per thread under `$CODEX_HOME/sessions/<local YYYY/MM/DD>/`:
// which thread each is (docs/spikes/codex.md). Only the first line, `session_meta`, which names
// the thread, the folder it runs in, when it started, and what started it; its messages are
// transcripts.ts. A thread gets its rollout at its first prompt, not at launch.

// ponytail: the first line holds Codex's base instructions (about 20 KiB in 0.154.0), read up to
// its newline; one longer than this is skipped, so read more if Codex's grow.
const HEAD_BYTES = 256 << 10;

const MetaSchema = z.object({
  type: z.literal('session_meta'),
  payload: z.object({
    id: z.uuid(),
    cwd: z.string(),
    // When the thread started (UTC), soon after its TUI did; the file's name has it in local time.
    timestamp: z.iso.datetime(),
    // `codex-tui` for an interactive codex, `codex_exec` for a headless one.
    originator: z.string(),
  }),
});

/** One interactive Codex thread, from its rollout's first line. */
export type CodexThread = { id: string; cwd: string; startedAt: string };

function rolloutFiles(deps: { env: Env; home: string }) {
  const sessions = codexSessions(codexHome(deps.home, deps.env));
  let names: string[];
  try {
    names = readdirSync(sessions, { recursive: true, encoding: 'utf8' });
  } catch {
    return [];
  }
  return names
    .filter((name) => /^rollout-.*\.jsonl$/.test(basename(name)))
    .map((name) => join(sessions, name));
}

/**
 * Rollouts written at or after `since`, each with when it was last written; the others are not
 * opened. A resumed thread stays in its original date folder.
 * ponytail: stats every rollout on each look; add an mtime index if large histories slow the Board.
 */
function rollouts(deps: { env: Env; home: string }, since: number) {
  return rolloutFiles(deps).flatMap((file) => {
    try {
      const mtime = statSync(file, { throwIfNoEntry: false })?.mtime;
      return mtime && mtime.getTime() >= since ? [{ file, mtime }] : [];
    } catch {
      return [];
    }
  });
}

/** The stored rollout for an exact native thread ID, regardless of its original date folder. */
export function rolloutForThread(deps: { env: Env; home: string }, id: string) {
  return rolloutFiles(deps).find((file) => basename(file).endsWith(`-${id}.jsonl`));
}

/** The exact interactive thread's native folder, including an older rollout. */
export function threadForId(deps: { env: Env; home: string }, id: string): CodexThread | undefined {
  const file = rolloutForThread(deps, id);
  const thread = file ? threadOf(file) : undefined;
  return thread?.id === id ? thread : undefined;
}

/**
 * Native interactive Codex conversations on disk, each with its rollout `file`, including older
 * rollouts; with `since` (epoch ms), only those last written then or later, the others not opened.
 */
export function codexHistory(deps: { env: Env; home: string }, since = Number.NEGATIVE_INFINITY) {
  return rollouts(deps, since).flatMap(({ file, mtime }) => {
    const thread = threadOf(file);
    return thread
      ? [{ agent: 'codex' as const, ...thread, file, updatedAt: mtime.toISOString() }]
      : [];
  });
}

/** An interactive thread's rollout, read from its first line; none for anything else. */
function threadOf(file: string): CodexThread | undefined {
  try {
    const head = fileHead(file, HEAD_BYTES, (h) => h.includes('\n'));
    const [first = ''] = head.split('\n', 1);
    const meta = MetaSchema.safeParse(JSON.parse(first));
    if (!meta.success || meta.data.payload.originator !== 'codex-tui') return undefined;
    const { id, cwd, timestamp } = meta.data.payload;
    return { id, cwd, startedAt: timestamp };
  } catch {
    // Gone since it was listed, cut at the head's end, or not JSON.
    return undefined;
  }
}

/** The interactive threads whose rollout was written at or after `since`. */
export function recentThreads(deps: { env: Env; home: string }, since: number) {
  return rollouts(deps, since).flatMap(({ file }) => threadOf(file) ?? []);
}

/**
 * The thread a Codex session runs, which Codex picks itself: the newest interactive thread that
 * started in `folder` at or after `since`, when the session's window opened, and before `until`,
 * when it was stopped, and that no session holds (`taken`). Its rollout stays in its original
 * date folder; only files written after the window opened are read, even when a trust prompt
 * delayed its first turn for days. None before its first prompt, which writes the rollout.
 */
export function codexSessionId(
  deps: { env: Env; home: string },
  s: { folder: string; since: string; until?: string },
  taken: ReadonlySet<string>,
): string | undefined {
  const since = Date.parse(s.since);
  const until = s.until === undefined ? Number.POSITIVE_INFINITY : Date.parse(s.until);
  const within = (t: CodexThread) =>
    Date.parse(t.startedAt) >= since && Date.parse(t.startedAt) < until;
  return rollouts(deps, since)
    .flatMap(({ file }) => threadOf(file) ?? [])
    .filter((t) => t.cwd === s.folder && within(t) && !taken.has(t.id))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]?.id;
}
