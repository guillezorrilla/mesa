import type { MesaContext } from '../../context.js';
import { counted } from '../../lib/format.js';
import { MesaError } from '../../lib/result.js';
import { joinWarnings } from '../../receipts/recorder.js';
import { projectLabel } from '../record/general.js';
import { isOver } from '../record/lifecycle.js';
import {
  launchGuardrail,
  markEnded,
  recordStart,
  startedOutputs,
} from '../record/session-receipt.js';
import { adoptSession } from '../start/adopt.js';
import { changeDependencies } from '../start/dependencies.js';
import { adoptDiscovered, type DiscoveryAdoption } from '../start/discovery-adopt.js';
import { forkSession } from '../start/fork.js';
import { handoffSession, stopHandedOff } from '../start/handoff.js';
import { startQueued } from '../start/queue.js';
import { resumeSession } from '../start/resume.js';
import { swapAgent } from '../start/swap.js';
import type { SessionDeps } from './deps.js';
import type { lifecycleActions } from './lifecycle.js';

/**
 * Work carried on from a session or a conversation: a handoff, an adoption, a resume, a swap, a
 * fork, and a queued session's dependencies and start.
 */
export function continueActions(
  ctx: MesaContext,
  deps: SessionDeps,
  /** The lifecycle's stop: a handoff stops the session it continues. */
  stop: ReturnType<typeof lifecycleActions>['stop'],
) {
  const { paths, open, store, tmux, record, absolute } = ctx;
  const { caller, openDeps, adoptDeps } = deps;
  /** What a discovery adoption's receipt keeps of one folder. */
  const adoptionOutputs = (r: DiscoveryAdoption) => ({
    registered: r.registered,
    adopted: r.adopted.map((a) => a.id),
    reopened: r.reopened.map((a) => a.id),
    failed: r.failed,
  });
  /** The first reopened session's launchGuardrail, which keeps the receipt. */
  const reopenedLaunch = (adoptions: readonly DiscoveryAdoption[]) => {
    const first = adoptions.flatMap((r) => r.reopened)[0];
    return first ? launchGuardrail(store.get(first.id), open().config.agents) : {};
  };
  return {
    /**
     * Continues a session's work in a successor (CONTEXT.md, Handoff), then stops it unless
     * `keep` (stopHandedOff). The handoff's session receipt names both and the note.
     */
    handoff: (id: string, opts: { note: string; keep?: boolean; agent?: string }) => {
      const note = absolute(opts.note);
      const keep = opts.keep ?? false;
      return recordStart(
        ctx,
        (r) => r.to,
        {
          summary: (r) => `Handed off session ${id} to ${r.to.id} (${r.stop})`,
          failure: `Could not hand off session ${id}`,
          session: () => id,
          inputs: { id, note, keep, ...(opts.agent ? { agent: opts.agent } : {}) },
          outputs: (r) => ({
            from: id,
            to: r.to.id,
            note: r.note,
            stop: r.stop,
            ...launchGuardrail(r.to, open().config.agents),
          }),
        },
        async () => {
          const done = await handoffSession({ ...openDeps(), handoffs: paths.handoffs }, id, {
            note,
            keep,
            agent: opts.agent,
          });
          const stopped = await stopHandedOff(
            {
              self: caller().session?.id === id,
              stopLater: tmux.runMesaLater,
              stopNow: async (session) => {
                const { result, warning } = await stop(session);
                return { outcome: result.outcome, warning };
              },
            },
            id,
            keep,
          );
          const warning = joinWarnings(done.warning, stopped.warning);
          return { ...done, stop: stopped.stop, ...(warning ? { warning } : {}) };
        },
      );
    },
    /**
     * Adopts a Claude Code or Codex session Mesa did not start: a record for it, and, unless
     * `noResume`, its conversation reopened in a Mesa window. Its warning is always said.
     */
    adopt: (
      agentSessionId: string,
      opts: { project?: string; name?: string; noResume?: boolean } = {},
    ) =>
      recordStart(
        ctx,
        (r) => r.record,
        {
          summary: ({ record: r }) =>
            `Adopted ${r.agent} session ${agentSessionId} as ${r.id} on ${r.project}`,
          failure: `Could not adopt native session ${agentSessionId}`,
          inputs: { agentSessionId, ...opts },
          outputs: ({ record: r }) => ({
            window: r.tmux.window,
            resumed: !opts.noResume,
            ...(r.cwd ? { cwd: r.cwd } : {}),
            ...(opts.noResume ? {} : launchGuardrail(r, open().config.agents)),
          }),
        },
        () => adoptSession(adoptDeps(), { agentSessionId, ...opts }),
      ),
    /**
     * Registers a project folder unless registered and adopts the native conversations of its
     * last `days` record-only, or exactly those of `ids` without a scan, and, with `live`, its
     * running sessions reopened: one receipt.
     */
    adoptDiscovered: ({
      path,
      ...input
    }: {
      path: string;
      days: number;
      live?: boolean;
      ids?: readonly string[];
    }) =>
      record(
        {
          // Reopened sessions with dangerous launch flags are kept (launchGuardrail).
          kind: 'guardrail',
          type: 'session',
          summary: (r) =>
            `Adopted ${counted(r.adopted.length + r.reopened.length, 'session')} on ${r.project}`,
          failure: `Could not adopt the sessions of ${absolute(path)}`,
          warning: (r) => r.warning,
          project: (r) => r.project,
          inputs: { ...input, path: absolute(path) },
          outputs: (r) => ({ ...adoptionOutputs(r), ...reopenedLaunch([r]) }),
        },
        async () => {
          const [one] = await adoptDiscovered(adoptDeps(), { ...input, paths: [absolute(path)] });
          return one as DiscoveryAdoption;
        },
      ),
    /**
     * adoptDiscovered for several project folders, in order, over one scan of the machine: one
     * receipt for them all.
     */
    adoptDiscoveredEach: (input: { paths: readonly string[]; days: number; live?: boolean }) => {
      const paths = input.paths.map(absolute);
      return record(
        {
          kind: 'guardrail',
          type: 'session',
          summary: (r) =>
            `Adopted ${counted(
              r.items.reduce((n, i) => n + i.adopted.length + i.reopened.length, 0),
              'session',
            )} on ${r.items.map((i) => i.project).join(', ')}`,
          failure: `Could not adopt the sessions of ${paths.join(', ')}`,
          warning: (r) => joinWarnings(...new Set(r.items.map((i) => i.warning))),
          inputs: { ...input, paths },
          outputs: (r) => ({
            items: r.items.map(adoptionOutputs),
            ...reopenedLaunch(r.items),
          }),
        },
        async () => ({ items: await adoptDiscovered(adoptDeps(), { ...input, paths }) }),
      );
    },
    /** Reopens a session's conversation in a new window, as a new record linked to the old. */
    resume: (id: string) =>
      recordStart(
        ctx,
        (r) => r.record,
        {
          summary: (r) =>
            `Resumed session ${r.from.id} as ${r.record.id} on ${projectLabel(r.record.project)}`,
          failure: `Could not resume session ${id}`,
          inputs: { id },
          outputs: (r) => ({
            window: r.record.tmux.window,
            agentSessionId: r.record.agentSessionId,
            resumedFrom: r.from.id,
            ...launchGuardrail(r.record, open().config.agents),
          }),
        },
        () => resumeSession(openDeps(), id),
      ).then((recorded) => markEnded(ctx, recorded, recorded.result.from)),
    /** A fresh session's agent swapped in place (CONTEXT.md, Swap), with its receipt. */
    swap: (id: string, agent: string) =>
      recordStart(
        ctx,
        (r) => r.record,
        {
          summary: (r) => `Swapped session ${r.record.id} to ${r.record.agent}`,
          failure: `Could not swap session ${id} to ${agent}`,
          inputs: { id, agent },
          outputs: (r) => ({
            window: r.record.tmux.window,
            agentSessionId: r.record.agentSessionId,
            ...launchGuardrail(r.record, open().config.agents),
          }),
        },
        () => swapAgent({ ...openDeps(), eventsDir: paths.events }, id, agent),
      ).then((recorded) => ({ ...recorded, result: recorded.result.record })),
    fork: (id: string, opts: { branch?: string; base?: string } = {}) =>
      recordStart(
        ctx,
        (r) => r.record,
        {
          summary: (r) => `Forked session ${id} as ${r.record.id}`,
          failure: `Could not fork session ${id}`,
          inputs: { id, ...opts },
          outputs: (r) => ({
            window: r.record.tmux.window,
            parent: id,
            ...launchGuardrail(r.record, open().config.agents),
          }),
        },
        () => forkSession(openDeps(), id, opts),
      ).then((recorded) => ({ ...recorded, result: recorded.result.record })),
    dependencies: (id: string, change: { parent?: string | null; after?: string }) =>
      recordStart(
        ctx,
        (r) => r.record,
        {
          summary: (r) => `Updated dependencies of session ${r.record.id}`,
          failure: `Could not update dependencies of session ${id}`,
          session: () => id,
          agent: () => undefined,
          inputs: { id, ...change },
          outputs: (r) => ({
            parent: r.record.parent ?? null,
            after: r.record.after ?? null,
            ...(r.started ? launchGuardrail(r.record, open().config.agents) : {}),
          }),
        },
        async () => {
          const changed = changeDependencies(store, id, change);
          if (change.after && isOver(store.get(change.after))) {
            const started = await startQueued(openDeps(), id, change.after);
            return {
              record: started?.record ?? store.get(id),
              warning: started?.warning,
              started: Boolean(started),
            };
          }
          return { record: changed, warning: undefined, started: false };
        },
      ).then((recorded) => ({ ...recorded, result: recorded.result.record })),
    forceStart: (id: string) =>
      recordStart(
        ctx,
        (r) => r.record,
        {
          summary: (r) => `Started queued session ${r.record.id} now`,
          failure: `Could not force-start session ${id}`,
          session: () => id,
          agent: () => undefined,
          inputs: { id, force: true },
          outputs: (r) => startedOutputs(r.record, open().config.agents),
        },
        async () => {
          const queued = store.get(id);
          if (queued.lastState.state !== 'queued') {
            throw new MesaError('usage', `session ${id} is not queued`);
          }
          const started = await startQueued(openDeps(), id);
          if (!started) throw new MesaError('usage', `session ${id} is already starting`);
          return { record: store.update(id, { after: undefined }), warning: started.warning };
        },
      ).then((recorded) => ({ ...recorded, result: recorded.result.record })),
  };
}
