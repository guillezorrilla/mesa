import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import type { Overrides } from '../../decisions/guardrail.js';
import { findProject } from '../../projects/projects.js';
import { receiptText } from '../../receipts/command.js';
import { joinWarnings } from '../../receipts/recorder.js';
import { sessionBranchName } from '../../worktrees/branch-name.js';
import { checkoutWorktree } from '../../worktrees/create.js';
import { applyDescendants } from '../end/descendants.js';
import { removeSession } from '../end/remove.js';
import { stopSession } from '../end/stop.js';
import { projectLabel, projectScope } from '../record/general.js';
import { heldWorktrees } from '../record/holders.js';
import { recordAgent } from '../record/record.js';
import { markEnded, recordStart, startedOutputs } from '../record/session-receipt.js';
import { endRun } from '../run/end.js';
import { runSkill } from '../run/index.js';
import type { RunInput } from '../run/start.js';
import { readGoal } from '../start/goal.js';
import { openSession } from '../start/open.js';
import { type OpenFlags, validateOpenInput } from '../start/open-input.js';
import { windowOf } from '../window/window-name.js';
import type { SessionDeps } from './deps.js';

type RemoveFlags = { force?: boolean; deleteWorktree?: boolean; deleteBranch?: boolean };

/** A session's life: opening it, running a skill as one, stopping it, and removing it. */
export function lifecycleActions(ctx: MesaContext, faro: Faro, deps: SessionDeps) {
  const { paths, open, store, tmux, record, secrets, absolute } = ctx;
  const { caller, openDeps, ends } = deps;
  /**
   * Ends a session politely, or at once with `force`. The stop gets a session receipt of its own
   * (none when it changed nothing), and the session's opening receipt is marked ended.
   */
  const stop = async (id: string, force = false) => {
    const recorded = await record(
      {
        type: 'session',
        summary: (r) => `Stopped session ${id} (${r.outcome})`,
        failure: `Could not stop session ${id}`,
        warning: (r) => r.warning,
        project: (r) => projectScope(r.record.project),
        session: () => id,
        agent: (r) => recordAgent(r.record),
        inputs: { id, force },
        outputs: (r) => ({ outcome: r.outcome, lastState: r.record.lastState.state }),
        changed: (r) => r.outcome !== 'already-ended',
      },
      async () => {
        const found = store.get(id);
        if (found.kind !== 'run' || found.endedAt) {
          return {
            ...(await stopSession(
              { store, tmux, run: ctx.run, clock: ctx.clock, sleep: ctx.sleep },
              id,
              {
                force,
              },
            )),
            warning: undefined,
          };
        }
        const pane = await tmux.findWindow(windowOf(found));
        const ended = await endRun(
          ctx,
          found,
          pane,
          pane?.dead ? undefined : 'stopped by mesa stop',
        );
        return {
          record: store.get(id),
          outcome: pane?.dead ? ('exited' as const) : ('killed' as const),
          warning: ended.warning,
        };
      },
    );
    const { outcome } = recorded.result;
    if (outcome === 'already-ended') return recorded;
    const queue = await ends.stopped(id, outcome);
    const ended =
      recorded.result.record.kind === 'run'
        ? recorded
        : await markEnded(ctx, recorded, recorded.result.record);
    const warning = joinWarnings(ended.warning, queue?.warning);
    return warning ? { ...ended, warning } : ended;
  };
  const remove = (id: string, opts: RemoveFlags = {}) =>
    record(
      {
        type: 'session',
        summary: (r) =>
          `Removed session ${id}${r.worktree ? `, its worktree${r.additional?.some((a) => a.worktree) ? 's' : ''}` : ''}${r.branch ? `, branch ${r.branch}` : ''}`,
        failure: `Could not remove session ${id}`,
        project: (r) => projectScope(r.project),
        session: () => id,
        inputs: { id, ...opts },
        outputs: (r) => r,
      },
      () =>
        removeSession(
          {
            store,
            tmux,
            run: ctx.run,
            profile: open,
            eventsDir: paths.events,
            logsDir: paths.logs,
            runs: paths.runs,
            costs: paths.costs,
          },
          id,
          opts,
        ),
    );
  return {
    /**
     * Starts `agent` (else the project's, else the profile's) in a new window, with the goal
     * as its first prompt, and with `branch`, in its own git worktree. The goal is read first,
     * so the receipt keeps it (receiptText); one Mesa cannot take fails inside the recorded
     * action, as every refusal does.
     */
    open: (
      project: string | undefined,
      opts: Omit<OpenFlags, 'project'> & { goalFile?: string } = {},
    ) => {
      const { agent, mode, background, parent, noParent, after, base, terminal, general, from } =
        opts;
      // A worktree of its own on a branch Mesa names (sessionBranchName); --with implies it.
      const named = Boolean(opts.worktree || (opts.with?.length && opts.branch === undefined));
      let refused: unknown;
      try {
        validateOpenInput({ ...opts, project, worktree: named });
      } catch (error) {
        refused = error;
      }
      const branch = named && !refused ? sessionBranchName(ctx.newId) : opts.branch;
      let goal: string | undefined;
      try {
        goal = readGoal({
          goal: opts.goal,
          goalFile: opts.goalFile === undefined ? undefined : absolute(opts.goalFile),
        });
      } catch (error) {
        refused ??= error;
      }
      const text = goal ?? opts.goal;
      const kept = text === undefined ? undefined : receiptText(text, ctx.argv, secrets());
      return recordStart(
        ctx,
        (r) => r.record,
        {
          ...(kept ? { argv: kept.argv } : {}),
          summary: ({ record: r }) =>
            r.lastState.state === 'queued'
              ? `Queued session ${r.id} on ${projectLabel(r.project)} after ${r.after}`
              : `Opened session ${r.id} on ${projectLabel(r.project)}`,
          failure: `Could not open a session on ${project ?? 'General'}`,
          inputs: {
            ...(project === undefined ? {} : { project }),
            ...(general ? { general: true } : {}),
            agent: agent ?? null,
            ...(mode === undefined ? {} : { mode }),
            ...(background ? { background: true } : {}),
            ...(kept ? { goal: kept.short } : {}),
            ...(parent === undefined ? {} : { parent }),
            ...(noParent ? { noParent } : {}),
            ...(after === undefined ? {} : { after }),
            ...(branch === undefined ? {} : { branch }),
            ...(base === undefined ? {} : { base }),
            ...(terminal ? { terminal: true } : {}),
            ...(opts.checkout === undefined ? {} : { checkout: opts.checkout }),
            ...(opts.with?.length ? { with: opts.with } : {}),
          },
          outputs: ({ record: r }) => startedOutputs(r, open().config.agents),
        },
        async () => {
          if (refused) throw refused;
          const worktree =
            opts.checkout === undefined || project === undefined
              ? undefined
              : await checkoutWorktree(
                  open(),
                  ctx.run,
                  store,
                  findProject(open(), project),
                  absolute(opts.checkout),
                  ctx.newId,
                );
          const input = {
            worktree,
            project,
            general,
            agent,
            mode,
            background,
            goal,
            parent,
            noParent,
            after,
            branch,
            base,
            terminal,
            from,
            automation: opts.automation,
            with: opts.with,
          };
          return openSession(openDeps(), input);
        },
      ).then((recorded) => ({ ...recorded, result: recorded.result.record }));
    },
    /** Runs a skill headlessly and waits for its result (CONTEXT.md, Skill run; runSkill). */
    run: (skill: string, opts: Omit<RunInput, 'skill'> & Overrides) =>
      runSkill(ctx, { faro, caller, start: deps.runDeps, stopped: ends.stopped }, skill, opts),
    /**
     * Removes a session's record, hook log, output log, and a run's output, and with the flags
     * its worktree and branch; a live one only with `force`. The session receipt says what went.
     */
    remove,
    removeDescendants: (id: string, opts: RemoveFlags = {}, expected?: readonly string[]) =>
      applyDescendants(
        store.list(),
        id,
        async (session) => {
          const recorded = await remove(session.id, {
            force: opts.force,
            ...(heldWorktrees(session).length
              ? { deleteWorktree: opts.deleteWorktree, deleteBranch: opts.deleteBranch }
              : {}),
          });
          return { ...recorded.result, receipt: recorded.receipt, warning: recorded.warning };
        },
        expected,
      ),
    stop,
    stopDescendants: (id: string, force = false, expected?: readonly string[]) =>
      applyDescendants(
        store.list(),
        id,
        async (session) => {
          const recorded = await stop(session.id, force);
          return {
            outcome: recorded.result.outcome,
            receipt: recorded.receipt,
            warning: recorded.warning,
          };
        },
        expected,
      ),
  };
}
