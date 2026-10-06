import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import type { Guarded, Overrides } from '../../decisions/guardrail.js';
import type { DecisionRecorder } from '../../decisions/types.js';
import { redactText } from '../../lib/redact.js';
import { findProject } from '../../projects/projects.js';
import { receiptText } from '../../receipts/command.js';
import { joinWarnings } from '../../receipts/recorder.js';
import { sessionBranchName } from '../../worktrees/branch-name.js';
import { checkoutWorktree } from '../../worktrees/create.js';
import { applyDescendants } from '../descendants.js';
import { projectLabel, projectScope } from '../general.js';
import { readGoal } from '../goal.js';
import { heldWorktrees } from '../holders.js';
import { openSession } from '../open.js';
import { type OpenFlags, validateOpenInput } from '../open-input.js';
import { recordAgent } from '../record.js';
import { removeSession } from '../remove.js';
import { awaitRun, endRun, type RunEnd, type RunInput, startRun } from '../run.js';
import { markEnded, recordStart, startedOutputs } from '../session-receipt.js';
import { stopSession } from '../stop.js';
import { windowOf } from '../window-name.js';
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
    /**
     * Runs a skill headlessly on a project (CONTEXT.md, Skill run), or about a session, whose
     * output log its agent reads, once the guardrail lets its prompt through (`yes`, `force`,
     * and a person's `confirm` past an ask or a block), and waits up to `timeoutSeconds` for
     * its result, which is returned, ok or not, with the vault note its output became, if any.
     * A blocked or overridden guardrail keeps its decision; a changed vault note keeps a
     * separate receipt. Its end, as a stop does, starts what was queued after it.
     */
    run: async (skill: string, opts: Omit<RunInput, 'skill'> & Overrides) => {
      const { force, yes, confirm, ...input } = opts;
      const { project, session, agent, args = [] } = input;
      const on = project ? ` on ${project}` : session ? ` about session ${session}` : '';
      const about = session ? store.find(session) : undefined;
      const started = await record(
        {
          kind: 'guardrail',
          type: 'skill',
          scope: {
            project: project ?? about?.project,
            session: about?.id,
            actor: caller().session?.id,
          },
          summary: ({ record: r }) =>
            `Started skill ${skill} on ${r.project}${r.about ? ` about session ${r.about}` : ''} as session ${r.id}`,
          failure: `Could not run skill ${skill}${on}`,
          warning: (r) => r.warning,
          project: (r) => projectScope(r.record.project),
          session: (r) => r.record.id,
          agent: (r) => recordAgent(r.record),
          inputs: {
            skill,
            ...(project === undefined ? {} : { project }),
            ...(session === undefined ? {} : { session }),
            agent: agent ?? null,
            args: args.map((a) => redactText(a, secrets())),
            ...(force ? { force } : {}),
            ...(yes ? { yes } : {}),
          },
          outputs: ({ record: r, override }) => ({
            ...startedOutputs(r, open().config.agents),
            ...(override ? { override } : {}),
          }),
        },
        // Typed, so the result type comes from the action, as for one that takes nothing.
        (decisions: DecisionRecorder) => {
          const guard = (action: Guarded) =>
            faro.guardrail.gate(action, { force, yes, confirm }, decisions);
          return startRun(deps.runDeps(skill, guard), { ...input, skill });
        },
      );
      const run = store.get(started.result.record.id);
      // A fast hook may finish before record() writes a guardrail override receipt. Complete
      // the run from its persisted record without depending on another tmux look.
      let finished: RunEnd;
      let queue: Awaited<ReturnType<typeof ends.stopped>>;
      try {
        finished = run.endedAt
          ? await endRun(ctx, run)
          : await awaitRun(ctx, run, input.timeoutSeconds);
      } finally {
        // A timeout commits the failed end before throwing; its queue must still start.
        if (store.find(run.id)?.endedAt) queue = await ends.stopped(run.id, 'exited');
      }
      const { result, receipt: landedReceipt, warning: ended } = finished;
      const warning = joinWarnings(started.warning, ended, queue?.warning);
      const { override } = started.result;
      return {
        result: { session: run.id, ...result, ...(override ? { override } : {}) },
        receipt: landedReceipt ?? started.receipt,
        ...(warning ? { warning } : {}),
      };
    },
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
