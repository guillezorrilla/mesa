import { rmSync } from 'node:fs';
import type { MesaContext } from '../../context.js';
import { MesaError } from '../../lib/result.js';
import type { SessionRecord } from '../record.js';
import { killIfThere, type TmuxBackend } from '../tmux/backend.js';
import { paneExit, type TmuxWindow } from '../tmux/format.js';
import { windowOf } from '../window-name.js';
import { type Exit, type HeadlessResult, runInput, runResult } from './files.js';
import { finishRun } from './land.js';
import { RUN_TIMEOUT_SECONDS } from './start.js';

// How a run ends, whoever sees its agent exit first: the wait in `mesa run`, or tmux's pane-died
// hook (endRun).

/** How often the wait looks at the run's pane. */
const POLL_MS = 1000;

/**
 * What ending a run takes: its record and window, the clock, the profile's runs/ (its result) and
 * logs/ (its pane's output, errors included), and the vault and secrets used when its output
 * becomes a note.
 */
export type EndContext = Pick<
  MesaContext,
  | 'store'
  | 'paths'
  | 'notes'
  | 'secrets'
  | 'open'
  | 'record'
  | 'clock'
  | 'home'
  | 'sleep'
  | 'processId'
  | 'processAlive'
> & {
  tmux: Pick<TmuxBackend, 'killWindow'>;
};

/** How a run ended: its result, and what its end could not record (endRun). */
export type RunEnd = {
  result: HeadlessResult;
  receipt?: { id: string; path: string } | null;
  warning?: string;
};

/**
 * Waits for a run's agent to exit, looking at its pane every second for up to `timeoutSeconds`,
 * then ends it (endRun) and returns how it ended, ok or not. Past the timeout the window is
 * closed, the run ended as not ok, and the wait is a `timeout` error.
 */
export async function awaitRun(
  ctx: EndContext & { tmux: Pick<TmuxBackend, 'findWindow' | 'killWindow'> },
  run: SessionRecord,
  timeoutSeconds = RUN_TIMEOUT_SECONDS,
): Promise<RunEnd> {
  const target = windowOf(run);
  for (let waited = 0; ; waited += POLL_MS) {
    const pane = await ctx.tmux.findWindow(target);
    // Read again: tmux's pane-died hook may have ended it already, keeping how it exited.
    if (!pane || pane.dead) return endRun(ctx, ctx.store.get(run.id), pane);
    if (waited >= timeoutSeconds * 1000) break;
    await ctx.sleep(POLL_MS);
  }
  const ended = await endRun(
    ctx,
    ctx.store.get(run.id),
    undefined,
    `timed out after ${timeoutSeconds} s`,
  );
  if (ended.result.ok) return ended; // The hook may have finished successfully after our last look.
  throw new MesaError(
    'timeout',
    `session ${run.id} ran ${run.goal} past its ${timeoutSeconds} s timeout: its window was closed and the session marked failed`,
    { session: run.id },
  );
}

/**
 * How a run ends, whoever sees its agent exit first: the wait in `mesa run`, or tmux's pane-died
 * hook, which ends it when that wait is gone. Its result is read from its files and how it exited
 * (the dead `pane`, else the exit its record keeps), not ok with `killed` as the reason when Mesa
 * killed it (a timeout); its window closed, and the session ended, `done` when the result is ok
 * and `failed` otherwise, with its exit recorded; its input removed; then its end recorded
 * (finishRun). A session already ended keeps its end, and the same result is read, and recorded,
 * again.
 */
export async function endRun(
  ctx: EndContext,
  run: SessionRecord,
  pane?: TmuxWindow,
  killed?: string,
): Promise<RunEnd> {
  const exited = run.events.find((e) => e.type === 'exited');
  const exit = pane?.dead
    ? paneExit(pane)
    : exited && { status: exited.status, signal: exited.signal };
  const at = run.endedAt ?? ctx.clock().toISOString();
  const read = runResult({ ...ctx.paths, lock: ctx }, run, exit, at);
  const result = killed ? { ...read, ok: false, reason: killed } : read;
  // Commit the outcome before killing the pane: its hook may finish the same run immediately.
  const ended = endRecord(ctx, run.id, result, at, exit);
  await killIfThere(ctx.tmux, windowOf(run));
  rmSync(runInput(ctx.paths.runs, run.id), { force: true });
  // Another process can finish between our file read and the locked update. Re-read using the
  // winning record's exit, including when it succeeded after our timeout read found no output.
  const winner = ended.events.find((event) => event.type === 'exited');
  const finalRead = runResult(
    { ...ctx.paths, lock: ctx },
    ended,
    winner ?? exit,
    ended.endedAt ?? at,
  );
  const final = ended.runFailure
    ? { ...finalRead, ok: false, reason: ended.runFailure }
    : finalRead;
  return finishRun(ctx, ended, final);
}

/**
 * Ends the run's session at `at` in `state`, which Mesa read from its result, recording its exit
 * when nothing has yet; one a stop or the other ender ended first keeps its end. The record as it
 * is now.
 */
function endRecord(
  deps: Pick<EndContext, 'store'>,
  id: string,
  result: HeadlessResult,
  at: string,
  exit?: Exit,
) {
  return deps.store.update(id, (current) => {
    if (current.endedAt) return {};
    const recorded = current.events.some((e) => e.type === 'exited');
    const state = result.ok ? 'done' : 'failed';
    return {
      endedAt: at,
      ...(result.agentSessionId ? { agentSessionId: result.agentSessionId } : {}),
      ...(!result.ok ? { runFailure: result.reason ?? 'run failed' } : {}),
      lastState: { state, confidence: 1, at, source: 'mesa' as const },
      ...(exit && !recorded
        ? { events: [...current.events, { type: 'exited' as const, at, ...exit }] }
        : {}),
    };
  });
}
