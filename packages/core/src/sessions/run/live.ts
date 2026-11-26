import { existsSync, readFileSync } from 'node:fs';
import { readClaudeStream } from '../../agents/claude/result.js';
import type { SessionRecord } from '../record/record.js';
import { runOutput } from './files.js';
import { skillOfRun } from './start.js';

// What a skill run that streams its answer (an Ask's, CONTEXT.md Ask (logs)) has written so far.

/**
 * The newest run of `skill` among `records` still running, started at or after `since`, and the
 * text its streamed answer holds so far in `runs` (readClaudeStream); no session when none runs.
 */
export function liveRunText(
  records: readonly SessionRecord[],
  runs: string,
  skill: string,
  since?: string,
) {
  const run = records
    .filter(
      (r) =>
        r.kind === 'run' &&
        !r.endedAt &&
        skillOfRun(r) === skill &&
        (!since || r.startedAt >= since),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!run) return { session: null, text: '' };
  const file = runOutput(runs, run.id);
  return {
    session: run.id,
    text: existsSync(file) ? readClaudeStream(readFileSync(file, 'utf8')) : '',
  };
}
