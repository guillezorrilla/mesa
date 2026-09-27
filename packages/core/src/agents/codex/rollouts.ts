import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { fileHead } from '../../lib/file-head.js';
import type { Env } from '../../lib/process.js';
import { localDay } from '../../lib/time.js';
import { codexHome, codexSessions } from './paths.js';

// Codex's rollouts, one JSONL file per thread under `$CODEX_HOME/sessions/<local YYYY/MM/DD>/`:
// what Mesa reads from them (docs/spikes/codex.md). Only the first line, `session_meta`, which
// names the thread, the folder it runs in, when it started, and what started it. A thread gets
// its rollout at its first prompt, not at launch.

// ponytail: the first line holds Codex's base instructions (about 20 KiB in 0.154.0); a longer
// one is skipped, so read more if Codex's grow.
const HEAD_BYTES = 256 << 10;

const MetaSchema = z.object({
  type: z.literal('session_meta'),
  payload: z.object({
    id: z.string(),
    cwd: z.string(),
    // When the thread started (UTC), soon after its TUI did; the file's name has it in local time.
    timestamp: z.iso.datetime(),
    // `codex-tui` for an interactive codex, `codex_exec` for a headless one.
    originator: z.string(),
  }),
});

/** One interactive Codex thread, from its rollout's first line. */
export type CodexThread = { id: string; cwd: string; startedAt: string };

/** `day`'s rollout folder: Codex names it by the local date. */
const dayFolder = (sessions: string, day: Date) => join(sessions, ...localDay(day).split('-'));

/** When a file was last written (epoch ms); 0 for one gone since it was listed. */
const writtenAt = (file: string) => statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;

/**
 * The rollouts in the folders of `days` written at or after `since` (epoch ms); none from a
 * folder that cannot be read.
 */
function rollouts(deps: { env: Env; home: string }, days: readonly Date[], since: number) {
  const sessions = codexSessions(codexHome(deps.env, deps.home));
  const folders = [...new Set(days.map((day) => dayFolder(sessions, day)))];
  return folders.flatMap((dir) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return [];
    }
    return names
      .filter((name) => /^rollout-.*\.jsonl$/.test(name))
      .map((name) => join(dir, name))
      .filter((file) => writtenAt(file) >= since);
  });
}

/** An interactive thread's rollout, read from its first line; none for anything else. */
function threadOf(file: string): CodexThread | undefined {
  try {
    const [first = ''] = fileHead(file, HEAD_BYTES).split('\n', 1);
    const meta = MetaSchema.safeParse(JSON.parse(first));
    if (!meta.success || meta.data.payload.originator !== 'codex-tui') return undefined;
    const { id, cwd, timestamp } = meta.data.payload;
    return { id, cwd, startedAt: timestamp };
  } catch {
    // Gone since it was listed, cut at the head's end, or not JSON.
    return undefined;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The interactive threads whose rollout was written at or after `since`, from the folders of
 * `now` and the day before, since a thread started before midnight keeps its first day's folder.
 */
export function recentThreads(deps: { env: Env; home: string }, now: Date, since: number) {
  const days = [now, new Date(now.getTime() - DAY_MS)];
  return rollouts(deps, days, since).flatMap((file) => threadOf(file) ?? []);
}

/**
 * The thread a Codex session runs, which Codex picks itself: the newest interactive thread that
 * started in `folder` at or after `since`, when the session's window opened, and before `until`,
 * when it was stopped, and that no session holds (`taken`). Its rollout is in the folder of the day it started, or of the next day for a
 * start held up past midnight (a trust prompt), and is written after it started, so older files
 * are not read. None before its first prompt, which writes the rollout.
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
  const days = [new Date(since), new Date(since + DAY_MS)];
  return rollouts(deps, days, since)
    .flatMap((file) => threadOf(file) ?? [])
    .filter((t) => t.cwd === s.folder && within(t) && !taken.has(t.id))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]?.id;
}
