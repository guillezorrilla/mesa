import { z } from 'zod';

// What a headless claude prints: `claude -p --output-format json` writes one result object on
// stdout when it is done (fixtures/results/, from Claude Code 2.1.283). Only these fields are
// read; the rest of the object is claude's own.

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

/** What a headless claude's stdout says it did: its answer and what it cost, or why there is none. */
export type ClaudeResult =
  | {
      read: true;
      ok: boolean;
      /** Its answer, or the error it reported. */
      output: string;
      agentSessionId: string;
      costUsd?: number;
      durationMs: number;
      /** Why it is not ok. */
      reason?: string;
    }
  | { read: false; reason: string };

/** Reads claude's JSON result from a headless run's stdout; never throws. */
export function readClaudeResult(stdout: string): ClaudeResult {
  const text = stdout.trim();
  if (!text) return { read: false, reason: 'claude printed no result' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
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
