import { lastMatchingLine } from '../../lib/file-tail.js';
import type { Env } from '../../lib/process.js';
import type { ContextUse } from '../../sessions/record.js';
import { rolloutForThread } from './rollouts.js';

/** Codex 0.157.1's last usage snapshot, not cumulative thread billing. */
function usageIn(line: string): ContextUse | undefined {
  if (!line.includes('"token_count"')) return undefined;
  try {
    const entry = JSON.parse(line) as {
      timestamp?: unknown;
      type?: unknown;
      payload?: {
        type?: unknown;
        info?: {
          last_token_usage?: { input_tokens?: unknown; total_tokens?: unknown };
          model_context_window?: unknown;
        };
      };
    };
    const last = entry.payload?.info?.last_token_usage;
    // A compaction event resets input_tokens to zero and puts the compacted context in total_tokens.
    const input = last?.total_tokens ?? last?.input_tokens;
    const window = entry.payload?.info?.model_context_window;
    if (
      entry.type !== 'event_msg' ||
      entry.payload?.type !== 'token_count' ||
      typeof input !== 'number' ||
      !Number.isFinite(input) ||
      input < 0 ||
      typeof window !== 'number' ||
      !Number.isFinite(window) ||
      window <= 0 ||
      typeof entry.timestamp !== 'string' ||
      !Number.isFinite(Date.parse(entry.timestamp))
    ) {
      return undefined;
    }
    return {
      used: Math.round((10_000 * input) / window) / 100,
      window,
      at: entry.timestamp,
      source: 'transcript',
    };
  } catch {
    return undefined;
  }
}

/** Model and effort of the turn that produced a later token-count reading. */
function turnIn(line: string): Pick<ContextUse, 'model' | 'effort'> | undefined {
  if (!line.includes('"turn_context"')) return undefined;
  try {
    const entry = JSON.parse(line) as {
      type?: unknown;
      payload?: { model?: unknown; effort?: unknown };
    };
    if (entry.type !== 'turn_context') return undefined;
    const model = entry.payload?.model;
    const effort = entry.payload?.effort;
    return {
      ...(typeof model === 'string' && model ? { model } : {}),
      ...(typeof effort === 'string' && effort ? { effort } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Context use from the exact thread's rollout; unknown until a completed turn records usage. */
export function codexContext(
  deps: { env: Env; home: string },
  agentSessionId: string,
): ContextUse | undefined {
  const file = rolloutForThread(deps, agentSessionId);
  if (!file) return undefined;
  let usage: ContextUse | undefined;
  const withTurn = lastMatchingLine(file, (line) => {
    if (!usage) {
      usage = usageIn(line);
      return undefined;
    }
    const turn = turnIn(line);
    return turn ? { ...usage, ...turn } : undefined;
  });
  return withTurn ?? usage;
}
