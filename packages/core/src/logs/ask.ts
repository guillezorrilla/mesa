import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import type { GitTextRunInfo, GitTextRunner } from '../git/message.js';
import { dataFence } from '../git/recipes.js';
import { MesaError } from '../lib/result.js';
import { GENERAL_PROJECT } from '../sessions/record/general.js';
import { CLOUD_LOGS } from '../skills/library.js';
import { answerParts } from './answer.js';
import type { AskQuery, AskTurn } from './ask-history.js';
import { mappedProject } from './cloud-entry.js';
import type { CloudLogEntry } from './gcp.js';
import { filterProblem } from './gcp-config.js';
import { groupSamples, type RangeFacts, rangeSummary, readFailed } from './range-summary.js';
import { foldedMessage } from './stack.js';

// Ask (logs) (CONTEXT.md): a question about Cloud Logs entries, answered by a headless run of the
// bundled `cloud-logs` skill from the General folder, reading the code of the project the asked
// services map to. It reads the range summary, the entries the filters picked and the conversation
// so far on its stdin, may run read-only `mesa logs` queries of its own, and cites the entries it
// used by id.

/** An entry's first line past this many characters is cut for the model; its stack is folded. */
const MESSAGE_LIMIT = 1000;
/** The most text a run reads on its stdin about the logs: the summary, samples, then entries. */
const LOGS_LIMIT_BYTES = 60_000;
/** The most of the budget the range summary takes, so the entries always keep a share. */
const SUMMARY_SHARE = 1 / 2;
/** The share of what the summary leaves that samples may take; the page of entries gets the rest. */
const SAMPLES_SHARE = 1 / 3;
/** The most earlier turns a follow-up carries. */
const TURNS_KEPT = 6;

/** As many of `lines` as `budget` bytes hold, in order, and the bytes they take. */
function fitting(lines: readonly string[], budget: number) {
  const out: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    const next = bytes + Buffer.byteLength(line) + 1;
    if (next > budget) break;
    bytes = next;
    out.push(line);
  }
  return { lines: out, bytes };
}

/** An entry as the model reads it: its message's first line cut, its stack folded. */
export const modelEntry = (entry: CloudLogEntry): CloudLogEntry => ({
  ...entry,
  message: foldedMessage(entry.message, MESSAGE_LIMIT),
});

/**
 * The registered project whose code an Ask reads: `named` (general for none), else the one most
 * of `refs` (`<project>/<service>`) map to in `fixProjects`, General left out; undefined for none.
 */
export function codeProject(
  fixProjects: Record<string, string>,
  refs: readonly string[],
  named?: string,
) {
  if (named !== undefined)
    return named === 'general' || named === GENERAL_PROJECT ? undefined : named;
  const counts = new Map<string, number>();
  for (const ref of refs) {
    const project = mappedProject(fixProjects, ref);
    if (project && project !== GENERAL_PROJECT) counts.set(project, (counts.get(project) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** What an Ask reads: the filter and entries, and the range's summary when it was read. */
export type AskRead = {
  filter: string;
  entries: readonly CloudLogEntry[];
  range?: RangeFacts;
  /** The registered project whose code the run may read, and its checkout's folder. */
  code?: { name: string; path: string };
};

/**
 * The run's stdin: the conversation so far, the person's question, then, fenced as data, the range
 * summary, a few samples per error group and the page of entries, within LOGS_LIMIT_BYTES.
 */
export function askInput(question: string, read: AskRead, earlier: readonly AskTurn[] = []) {
  const lines = read.range ? rangeSummary(read.range).split('\n') : [];
  const kept = fitting(lines, LOGS_LIMIT_BYTES * SUMMARY_SHARE).lines;
  const summary = [
    ...kept,
    ...(kept.length < lines.length ? ['... (the summary was cut here)'] : []),
  ].join('\n');
  const allSamples =
    read.range && !readFailed(read.range.errors) ? groupSamples(read.range.errors.groups) : [];
  const left = LOGS_LIMIT_BYTES - Buffer.byteLength(summary);
  const samples = fitting(allSamples, left * SAMPLES_SHARE);
  const page = fitting(
    read.entries.map((entry) => JSON.stringify(modelEntry(entry))),
    left - samples.bytes,
  ).lines;
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
    ...(read.code
      ? [
          `The code of ${read.code.name}, the project behind these services, is in ${read.code.path}: read it there with Read, Grep and Glob (pass that folder as the path).`,
          '',
        ]
      : []),
    ...(read.range
      ? [
          'The range, summarised over its whole span:',
          dataFence('text', summary),
          '',
          `A few samples of each error group, deduplicated, one JSON object a line (${samples.lines.length} of ${allSamples.length}):`,
          dataFence('jsonl', samples.lines.join('\n') || '(none)'),
          '',
        ]
      : []),
    'The Cloud Logging filter the entries were read with, per GCP project:',
    dataFence('text', read.filter),
    '',
    `The entries, newest first, one JSON object a line (${page.length} of ${read.entries.length}):`,
    dataFence('jsonl', page.join('\n') || '(none)'),
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
 * The answer a General `cloud-logs` run gives to `question` about what it `read`, after the
 * `earlier` turns, and the ids of the entries it cites; with `read.code`, it reads that registered
 * project's code; `model` answers, and `onStart` hears its run's session id once it starts.
 */
export async function askCloudLogs(
  runText: GitTextRunner,
  question: string,
  read: AskRead,
  earlier: readonly AskTurn[] = [],
  how: { model?: string; onStart?: (session: string) => void } = {},
): Promise<{ answer: string; cited: string[]; run: GitTextRunInfo & { model?: string } }> {
  if (!question.trim()) throw new MesaError('usage', 'ask a question about the logs');
  const { result } = await runText(CLOUD_LOGS, {
    project: GENERAL_PROJECT,
    input: askInput(question, read, earlier),
    ...(read.code ? { code: read.code } : {}),
    ...how,
  });
  const run = {
    session: result.session,
    durationMs: result.durationMs,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
    ...(how.model ? { model: how.model } : {}),
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

/**
 * A Logging query for `sentence`, written by a General `cloud-logs` run ("Ask in words"): it reads
 * the sentence, the query shown and the context fields the entries carry (names only, never their
 * values), and answers with one query in a `query` fence, which is checked to be one expression.
 */
export async function queryFromWords(
  runText: GitTextRunner,
  sentence: string,
  context: { query: string; fields: readonly string[] },
): Promise<{ query: string; run: GitTextRunInfo }> {
  if (!sentence.trim()) throw new MesaError('usage', 'say in words what to find');
  const input = [
    'Write a query: answer with one Cloud Logging query in a fence tagged query, and nothing else.',
    '',
    'What to find:',
    sentence.trim(),
    '',
    'The query shown now:',
    dataFence('text', context.query || '(none)'),
    '',
    'Context fields the entries carry (jsonPayload.<name>):',
    dataFence('text', context.fields.join(', ') || '(none)'),
  ].join('\n');
  const { result } = await runText(CLOUD_LOGS, { project: GENERAL_PROJECT, input });
  const run: GitTextRunInfo = {
    session: result.session,
    durationMs: result.durationMs,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
  };
  const query = answerParts(result.output).query;
  const problem = query ? filterProblem(query) : 'is missing';
  if (!result.ok || !query || problem)
    throw new MesaError(
      'internal',
      `the ${CLOUD_LOGS} run ${result.session} gave no usable query: it ${problem ?? result.reason}`,
      { run },
    );
  return { query, run };
}
