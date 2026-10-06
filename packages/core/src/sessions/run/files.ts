import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from '../../agents/agents.js';
import type { LockDeps } from '../../lib/lock-file.js';
import { MesaError } from '../../lib/result.js';
import { outputTail } from '../output-log.js';
import type { SessionRecord } from '../record.js';
import { exitState } from '../state.js';

// A run's files, local to the profile: the result its agent prints into runs/, the input a run
// about a session reads, and what its result says once read.

/** Where a run's agent writes its stdout, its result: `<runs>/<session id>.json`, local to the profile. */
export const runOutput = (runs: string, id: string) => join(runs, `${id}.json`);
/** Where a run about a session reads its stdin from, until it ends: `<runs>/<session id>.input`. */
export const runInput = (runs: string, id: string) => join(runs, `${id}.input`);

/** What a run gave back: the agent's answer, its conversation, what it cost, how long it took. */
export type HeadlessResult = {
  ok: boolean;
  /** The agent's answer, or the error it reported; empty when its output does not read. */
  output: string;
  agentSessionId: string;
  costUsd?: number;
  /** Provider token counts, without an invented dollar price. */
  usage?: Record<string, number>;
  durationMs: number;
  /** Why it is not ok: the agent's own error, its exit, or why its output does not read. */
  reason?: string;
  /** The vault note its output became, for a skill whose output lands (skills/landing.ts). */
  note?: string;
};

export type Exit = { status?: number; signal?: string };

/**
 * A run's result from its files: what its agent printed, not ok when it exited nonzero or by a
 * signal. Output that does not read is not ok, with why, how the agent exited (`exit`, none when
 * its window went first), and the last line its pane showed (its stderr), from its output log.
 */
export function runResult(
  deps: { runs: string; logs: string; lock: LockDeps },
  run: SessionRecord,
  exit: Exit | undefined,
  at: string,
): HeadlessResult {
  if (run.agent === 'terminal')
    throw new MesaError('usage', `session ${run.id} is not a skill run`);
  const file = runOutput(deps.runs, run.id);
  const said = existsSync(file)
    ? AGENTS[run.agent].headless.result(readFileSync(file, 'utf8'))
    : { read: false as const, reason: `no output at ${file}` };
  const failed =
    exit && exitState({ deadStatus: exit.status, deadSignal: exit.signal }) === 'failed';
  const how = !exit
    ? `its window closed before ${run.agent} finished`
    : exit.signal
      ? `${run.agent} was killed by ${exit.signal}`
      : `${run.agent} exited with status ${exit.status ?? 0}`;
  if (said.read) {
    const { read: _, ...parsed } = said;
    const read = {
      ...parsed,
      durationMs: parsed.durationMs ?? Math.max(0, Date.parse(at) - Date.parse(run.startedAt)),
    };
    return read.ok && failed ? { ...read, ok: false, reason: how } : read;
  }
  return {
    ok: false,
    output: '',
    agentSessionId: run.agentSessionId ?? '',
    durationMs: Math.max(0, Date.parse(at) - Date.parse(run.startedAt)),
    reason: [
      said.reason,
      failed || !exit ? how : undefined,
      outputTail(deps.lock, deps.logs, run.id, 1)?.[0],
    ]
      .filter(Boolean)
      .join('; '),
  };
}
