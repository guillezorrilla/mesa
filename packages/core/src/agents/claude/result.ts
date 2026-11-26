import { z } from 'zod';
import type { AgentResult } from '../result.js';
import { parseStreamLine } from './stream/events.js';

// What a headless claude prints: `claude -p --output-format json` writes one result object on
// stdout when it is done (fixtures/results/, from Claude Code 2.1.283); with `stream-json` (an
// Ask's run, which streams its answer) one JSON event a line, the result last. Only these fields
// are read; the rest of the object is claude's own.

const ResultSchema = z.object({
  type: z.literal('result'),
  /** `success`, or how the run stopped early (`error_max_turns`, `error_during_execution`). */
  subtype: z.string(),
  /** Set with `subtype: success` too: a "Not logged in" run says both. */
  is_error: z.boolean(),
  result: z.string().optional(),
  session_id: z.string(),
  total_cost_usd: z.number().nonnegative().optional(),
  duration_ms: z.number().nonnegative(),
});

/** One line of JSON, or undefined when it does not read. */
const jsonLine = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/** Reads claude's JSON result from a headless run's stdout, one object or a stream's last; never throws. */
export function readClaudeResult(stdout: string): AgentResult {
  const text = stdout.trim();
  if (!text) return { read: false, reason: 'claude printed no result' };
  let raw: unknown = jsonLine(text);
  // A stream's result is its last line: read from the end, stopping at the first result.
  for (const line of raw === undefined ? text.split('\n').reverse() : []) {
    if (parseStreamLine(line).type === 'result') {
      raw = jsonLine(line);
      break;
    }
  }
  if (raw === undefined) {
    return { read: false, reason: 'claude printed something other than its JSON result' };
  }
  const parsed = ResultSchema.safeParse(raw);
  if (!parsed.success) return { read: false, reason: 'claude printed JSON that is not a result' };
  const r = parsed.data;
  const ok = r.subtype === 'success' && !r.is_error;
  const reason = r.is_error
    ? r.result || `claude reported an error (${r.subtype})`
    : `claude stopped before it finished (${r.subtype})`;
  return {
    read: true,
    ok,
    output: r.result ?? '',
    agentSessionId: r.session_id,
    ...(r.total_cost_usd === undefined ? {} : { costUsd: r.total_cost_usd }),
    durationMs: r.duration_ms,
    ...(ok ? {} : { reason }),
  };
}

/**
 * The text of the newest assistant message a `stream-json` run has written so far (its
 * `--include-partial-messages` deltas, read by parseStreamLine): what an Ask's answer shows while
 * it comes. Each new message starts it again, so the text before a tool call gives way to the
 * next; a subagent's text is not the run's answer. Empty when nothing reads.
 */
export function readClaudeStream(stdout: string) {
  let text = '';
  for (const line of stdout.split('\n')) {
    const event = parseStreamLine(line);
    if (event.type === 'stream' && event.event === 'message_start') text = '';
    else if (event.type === 'delta' && event.kind === 'text' && !event.sidechain)
      text += event.text;
  }
  return text;
}
