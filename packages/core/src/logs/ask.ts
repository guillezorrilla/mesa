import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { GitTextRunInfo, GitTextRunner } from '../git/message.js';
import { dataFence } from '../git/recipes.js';
import { clip } from '../lib/clip.js';
import { MesaError } from '../lib/result.js';
import { GENERAL_PROJECT } from '../sessions/record/general.js';
import { CLOUD_LOGS } from '../skills/library.js';
import type { AskQuery, AskTurn } from './ask-history.js';
import type { CloudLogEntry } from './gcp.js';

// Ask (logs) (CONTEXT.md): a question about Cloud Logs entries, answered by a headless run of the
// bundled `cloud-logs` skill in the General project. It reads the entries the filters picked and
// the conversation so far on its stdin, may run read-only `mesa logs` queries of its own, and
// cites the entries it used by id.

/** An entry's message past this many characters is cut for the model. */
const MESSAGE_LIMIT = 1000;
/** The most entry text a run reads on its stdin; the oldest past it are left out. */
const ENTRIES_LIMIT_BYTES = 60_000;
/** The most earlier turns a follow-up carries. */
const TURNS_KEPT = 6;

/** One entry a line, newest first, as much as ENTRIES_LIMIT_BYTES holds. */
function entryLines(entries: readonly CloudLogEntry[]) {
  const lines: string[] = [];
  let bytes = 0;
  for (const entry of entries) {
    const line = JSON.stringify({ ...entry, message: clip(entry.message, MESSAGE_LIMIT) });
    bytes += line.length + 1;
    if (bytes > ENTRIES_LIMIT_BYTES) break;
    lines.push(line);
  }
  return lines;
}

/**
 * The run's stdin: the conversation so far, the person's question, then the filter and the
 * entries, fenced as data.
 */
export function askInput(
  question: string,
  filter: string,
  entries: readonly CloudLogEntry[],
  earlier: readonly AskTurn[] = [],
) {
  const lines = entryLines(entries);
  const turns = earlier.slice(-TURNS_KEPT);
  return [
    ...(turns.length
      ? [
          'The conversation so far, oldest first:',
          dataFence('text', turns.map((t) => `Q: ${t.question}\nA: ${t.answer}`).join('\n\n')),
          '',
        ]
      : []),
    'Question:',
    question.trim(),
    '',
    'The Cloud Logging filter the entries were read with, per GCP project:',
    dataFence('text', filter),
    '',
    `The entries, newest first, one JSON object a line (${lines.length} of ${entries.length}):`,
    dataFence('jsonl', lines.join('\n') || '(none)'),
  ].join('\n');
}

/** Keeps a query an Ask's run made, one JSON line each, appended as its `mesa logs` calls come. */
export const keepQuery = (file: string, query: AskQuery) =>
  appendFileSync(file, `${JSON.stringify(query)}\n`, { mode: 0o600 });

/** The queries run `session` made while it ran (service.ts keeps them); none when it made none. */
export function runQueries(file: string): AskQuery[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as AskQuery];
      } catch {
        return [];
      }
    });
}

/**
 * The answer a General `cloud-logs` run gives to `question` about `entries`, read with
 * `filter`, after the `earlier` turns, and the ids of the entries it cites.
 */
export async function askCloudLogs(
  runText: GitTextRunner,
  question: string,
  read: { filter: string; entries: readonly CloudLogEntry[] },
  earlier: readonly AskTurn[] = [],
): Promise<{ answer: string; cited: string[]; run: GitTextRunInfo }> {
  if (!question.trim()) throw new MesaError('usage', 'ask a question about the logs');
  const { result } = await runText(CLOUD_LOGS, {
    project: GENERAL_PROJECT,
    input: askInput(question, read.filter, read.entries, earlier),
  });
  const run: GitTextRunInfo = {
    session: result.session,
    durationMs: result.durationMs,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
  };
  const answer = result.output.trim();
  if (!result.ok || !answer)
    throw new MesaError(
      'internal',
      `the ${CLOUD_LOGS} run ${result.session} gave no answer: ${result.reason ?? 'its answer was empty'}`,
      { run },
    );
  // Only the `[id]` form the skill cites with: an id in prose is no citation. It may cite an
  // entry one of its own queries read, so any id-shaped token counts.
  const cited = [...new Set([...answer.matchAll(/\[([\w-]{4,})\]/g)].map((m) => m[1] as string))];
  return { answer, cited, run };
}
