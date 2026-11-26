import { entryText, type ServerLogEntry } from './parse.js';
import { stackSummary } from './stack.js';
import { requestIds } from './tokens.js';

// What the Logs panel puts in a prompt (CONTEXT.md, Logs panel): the ask, the source, the request,
// the lines before the first error, and the picked lines. Pure, so the app bundles it.

/** What the person asks of the agent about the picked lines. */
export type LogAsk =
  | { kind: 'send' }
  | { kind: 'explain' }
  | { kind: 'fix' }
  | { kind: 'ask'; question: string };

/** How many lines before the first picked error go along as context. */
export const CONTEXT_LINES = 20;

const ASKS: Record<Exclude<LogAsk['kind'], 'ask'>, string> = {
  send: 'Lines from a local server log.',
  explain: 'Explain what happened in these local server log lines: what failed and why.',
  fix: 'Find the cause of the error in these local server log lines, then fix it.',
};

/** Entries as text for an agent, each stack summarized (stackSummary), in a fenced block. */
function block(entries: readonly ServerLogEntry[], time: (entry: ServerLogEntry) => string | null) {
  const body = entries
    .map((entry) =>
      entryText({ ...entry, stack: entry.stack && stackSummary(entry.stack) }, time(entry)),
    )
    .join('\n');
  const fence = body.includes('```') ? '~~~~' : '```';
  return `${fence}\n${body}\n${fence}`;
}

/**
 * The prompt for `picked` (indexes into `entries`, the stream in order): the ask, the source, the
 * request the picked lines name, up to 20 lines before the first picked error (else the first
 * picked line) that were not picked, then the picked lines. `time` shows an entry's time.
 */
export function logMessage(input: {
  ask: LogAsk;
  source: string;
  entries: readonly ServerLogEntry[];
  picked: readonly number[];
  time?: (entry: ServerLogEntry) => string | null;
}) {
  const time = input.time ?? ((entry: ServerLogEntry) => entry.time);
  const picked = [...input.picked].sort((a, b) => a - b);
  const lines = picked.flatMap((at) => input.entries[at] ?? []);
  const first = picked.find((at) => input.entries[at]?.level === 'error') ?? picked[0] ?? 0;
  const chosen = new Set(picked);
  const context = input.entries
    .slice(Math.max(0, first - CONTEXT_LINES), first)
    .filter((_, at) => !chosen.has(Math.max(0, first - CONTEXT_LINES) + at));
  const request = lines.flatMap((entry) => requestIds(entry.message))[0];
  return [
    input.ask.kind === 'ask' ? input.ask.question.trim() : ASKS[input.ask.kind],
    '',
    `Source: ${input.source}`,
    ...(request ? [`Request: ${request}`] : []),
    ...(context.length
      ? ['', `The ${context.length} lines before them:`, block(context, time)]
      : []),
    '',
    `The lines (${lines.length}):`,
    block(lines, time),
    '',
  ].join('\n');
}
