import { existsSync } from 'node:fs';
import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import type { Guarded, Overrides } from '../decisions/guardrail.js';
import type { DecisionRecorder } from '../decisions/types.js';
import { shortId } from '../lib/ids.js';
import { redactText, redactWhole } from '../lib/redact.js';
import { projectPriorities } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { receiptText } from '../receipts/command.js';
import { joinWarnings } from '../receipts/recorder.js';
import type { skillsService } from '../skills/service.js';
import { adoptSession } from './adopt.js';
import { listAgentProcesses } from './agent-listing.js';
import { attachSession } from './attach.js';
import { listSessions } from './board/board.js';
import { sessionTree } from './board/tree.js';
import { callerOf } from './caller.js';
import { refreshContext } from './context-use.js';
import { otherProfilesSessions } from './elsewhere.js';
import { endSignals } from './end-signals.js';
import { readGoal, sessionGoal } from './goal.js';
import { handoffSession, stopHandedOff } from './handoff.js';
import { readHookEvents } from './hook-events.js';
import { type OpenInput, openSession } from './open.js';
import { outputLog, sessionLog } from './output-log.js';
import { removeSession } from './remove.js';
import { renameSession } from './rename.js';
import { resizeSession } from './resize.js';
import { resumeSession } from './resume.js';
import { awaitRun, endRun, type RunInput, startRun } from './run.js';
import { sendPrompt } from './send.js';
import { markEnded, startedOutputs } from './session-receipt.js';
import { stopSession } from './stop.js';
import { viewProject } from './view.js';
import { windowOf } from './window-name.js';

/**
 * Every session action, each with its receipt, plus the hooks' entry points and the tmux
 * windows: the Session Board's side of Mesa for one profile.
 */
export function sessionsService(
  ctx: MesaContext,
  faro: Faro,
  /** The skills service's: links a project's enabled skills into a folder, and lists what it sees. */
  skills: Pick<ReturnType<typeof skillsService>, 'linkInto' | 'list'>,
) {
  const { profile, deps, paths, open, store, tmux, record, secrets, absolute } = ctx;
  /** Where a session's context use is read: its agent's files under home, with this env. */
  const contextDeps = { store, home: deps.home, env: deps.env };
  /** What a terminal on a window takes: the user's terminal app, and a fresh view id each. */
  const terminal = {
    run: deps.run,
    scripts: paths.attachScripts,
    env: deps.env,
    viewId: () => shortId(deps.newId),
  };
  const terminalApp = () => open().config.terminal.app;
  /** Who runs this mesa: the session whose Mesa window it is in, if any. */
  const caller = () => callerOf({ store, env: deps.env, profileName: profile });
  const openDeps = () => ({
    profile: open(),
    profileName: profile,
    store,
    tmux,
    run: deps.run,
    clock: deps.clock,
    newUuid: deps.newUuid,
    caller,
    syncSkills: skills.linkInto,
  });
  /** The board: sessions merged with live tmux and the agent listing; ended ones only with `all`. */
  const look = (all = false) =>
    listSessions(
      {
        store,
        tmux,
        listing: () => listAgentProcesses(deps),
        projects: readRegistry(paths.registry),
        elsewhere: () => otherProfilesSessions(deps.home, profile),
        events: (id) => readHookEvents(paths.events, id),
        priorityOf: projectPriorities(open),
        faro: faro.profile(),
        backends: faro.shared,
        clock: deps.clock,
        env: deps.env,
        home: deps.home,
      },
      { all },
    ).then((rows) =>
      rows.map((row) =>
        row.managed ? { ...row, hasOutputLog: existsSync(outputLog(paths.logs, row.id)) } : row,
      ),
    );
  const ends = endSignals(ctx, { look, launch: openDeps, context: contextDeps });
  const { board } = ends;
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
        project: (r) => r.record.project,
        session: () => id,
        agent: (r) => r.record.agent,
        inputs: { id, force },
        outputs: (r) => ({ outcome: r.outcome, lastState: r.record.lastState.state }),
        changed: (r) => r.outcome !== 'already-ended',
      },
      async () => {
        const found = store.get(id);
        if (found.kind !== 'run' || found.endedAt) {
          return {
            ...(await stopSession({ store, tmux, clock: deps.clock, sleep: deps.sleep }, id, {
              force,
            })),
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
  return {
    sessions: {
      list: board,
      /** The board as a tree: children under their parent, each row with its depth. */
      tree: async (all = false) => sessionTree(await board(all)),
      /**
       * Starts `agent` (else the project's, else the profile's) in a new window, with the goal
       * as its first prompt, and with `branch`, in its own git worktree. The goal is read first,
       * so the receipt keeps it (receiptText); one Mesa cannot take fails inside the recorded
       * action, as every refusal does.
       */
      open: (project: string, opts: Omit<OpenInput, 'project'> & { goalFile?: string } = {}) => {
        const { agent, parent, noParent, after, branch, base } = opts;
        let goal: string | undefined;
        let refused: unknown;
        try {
          goal = readGoal({
            goal: opts.goal,
            goalFile: opts.goalFile === undefined ? undefined : absolute(opts.goalFile),
          });
        } catch (error) {
          refused = error;
        }
        const text = goal ?? opts.goal;
        const kept = text === undefined ? undefined : receiptText(text, deps.argv, secrets());
        return record(
          {
            type: 'session',
            ...(kept ? { argv: kept.argv } : {}),
            summary: ({ record: r }) =>
              r.lastState.state === 'queued'
                ? `Queued session ${r.id} on ${r.project} after ${r.after}`
                : `Opened session ${r.id} on ${r.project}`,
            failure: `Could not open a session on ${project}`,
            warning: (r) => r.warning,
            project: (r) => r.record.project,
            session: (r) => r.record.id,
            agent: (r) => r.record.agent,
            inputs: {
              project,
              agent: agent ?? null,
              ...(kept ? { goal: kept.short } : {}),
              ...(parent === undefined ? {} : { parent }),
              ...(noParent ? { noParent } : {}),
              ...(after === undefined ? {} : { after }),
              ...(branch === undefined ? {} : { branch }),
              ...(base === undefined ? {} : { base }),
            },
            outputs: ({ record: r }) => startedOutputs(r),
          },
          async () => {
            if (refused) throw refused;
            const input = { project, agent, goal, parent, noParent, after, branch, base };
            return openSession(openDeps(), input);
          },
        ).then((recorded) => ({ ...recorded, result: recorded.result.record }));
      },
      /**
       * Runs a skill headlessly on a project (CONTEXT.md, Skill run), or about a session, whose
       * output log its agent reads, once the guardrail lets its prompt through (`yes`, `force`,
       * and a person's `confirm` past an ask or a block), and waits up to `timeoutSeconds` for
       * its result, which is returned, ok or not, with the vault note its output became, if any.
       * Its start writes a skill receipt, with the guardrail's decision and the override, which
       * its end finishes (endRun); its end, as a stop does, starts what was queued after it.
       */
      run: async (skill: string, opts: Omit<RunInput, 'skill'> & Overrides) => {
        const { force, yes, confirm, ...input } = opts;
        const { project, session, agent, args = [] } = input;
        const on = project ? ` on ${project}` : session ? ` about session ${session}` : '';
        const started = await record(
          {
            type: 'skill',
            summary: ({ record: r }) =>
              `Started skill ${skill} on ${r.project}${r.about ? ` about session ${r.about}` : ''} as session ${r.id}`,
            failure: `Could not run skill ${skill}${on}`,
            warning: (r) => r.warning,
            project: (r) => r.record.project,
            session: (r) => r.record.id,
            agent: (r) => r.record.agent,
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
              ...startedOutputs(r),
              ...(override ? { override } : {}),
            }),
          },
          // Typed, so the result type comes from the action, as for one that takes nothing.
          (decisions: DecisionRecorder) => {
            const guard = (action: Guarded) =>
              faro.guardrail.gate(action, { force, yes, confirm }, decisions);
            const runDeps = {
              ...openDeps(),
              runs: paths.runs,
              logs: paths.logs,
              redact: (text: string) => redactWhole(text, deps.home, secrets()),
              skills: skills.list,
              guard,
            };
            return startRun(runDeps, { ...input, skill });
          },
        );
        const run = started.result.record;
        const { result, warning: ended } = await awaitRun(ctx, run, input.timeoutSeconds);
        const queue = await ends.stopped(run.id, 'exited');
        const warning = joinWarnings(started.warning, ended, queue?.warning);
        const { override } = started.result;
        return {
          result: { session: run.id, ...result, ...(override ? { override } : {}) },
          receipt: started.receipt,
          ...(warning ? { warning } : {}),
        };
      },
      /** A session's goal, or not_found when it was started without one. */
      goal: (id: string) => sessionGoal(store, id),
      /**
       * A session's output as plain text, its last `tail` lines when given (sessionLog); not_found
       * for an unknown id.
       */
      logs: (id: string, tail?: number) => {
        store.get(id);
        return sessionLog(paths.logs, id, tail);
      },
      /**
       * One session's record, its context use read now, with `alive` as the board reads it;
       * not_found for an unknown id.
       */
      show: async (id: string) => {
        refreshContext(contextDeps, store.get(id));
        const row = (await board(true)).find((r) => r.id === id);
        // Read again: the look may have saved a new state, or started it from its queue.
        return { ...store.get(id), alive: row?.alive ?? false };
      },
      /** Gives a session the name a person calls it by; the board shows it in place of the id. */
      rename: (id: string, name: string) =>
        record(
          {
            type: 'session',
            summary: (r) => `Renamed session ${id} to ${r.name}`,
            failure: `Could not rename session ${id}`,
            project: (r) => r.project,
            session: () => id,
            inputs: { id, name },
            outputs: (r) => ({ name: r.name }),
          },
          () => renameSession(store, id, name),
        ),
      /**
       * Removes a session's record, hook log, output log, and a run's output, and with the flags
       * its worktree and branch; a live one only with `force`. The session receipt says what went.
       */
      remove: (
        id: string,
        opts: { force?: boolean; deleteWorktree?: boolean; deleteBranch?: boolean } = {},
      ) =>
        record(
          {
            type: 'session',
            summary: (r) =>
              `Removed session ${id}${r.worktree ? ', its worktree' : ''}${r.branch ? `, branch ${r.branch}` : ''}`,
            failure: `Could not remove session ${id}`,
            project: (r) => r.project,
            session: () => id,
            inputs: { id, ...opts },
            outputs: (r) => r,
          },
          () =>
            removeSession(
              {
                store,
                tmux,
                run: deps.run,
                profile: open,
                eventsDir: paths.events,
                logsDir: paths.logs,
                runs: paths.runs,
              },
              id,
              opts,
            ),
        ),
      stop,
      /**
       * Continues a session's work in a successor (CONTEXT.md, Handoff), then stops it unless
       * `keep` (stopHandedOff). The handoff's session receipt names both and the note.
       */
      handoff: (id: string, opts: { note: string; keep?: boolean }) => {
        const note = absolute(opts.note);
        const keep = opts.keep ?? false;
        return record(
          {
            type: 'session',
            summary: (r) => `Handed off session ${id} to ${r.to.id} (${r.stop})`,
            failure: `Could not hand off session ${id}`,
            warning: (r) => r.warning,
            project: (r) => r.to.project,
            session: () => id,
            agent: (r) => r.to.agent,
            inputs: { id, note, keep },
            outputs: (r) => ({ from: id, to: r.to.id, note: r.note, stop: r.stop }),
          },
          async () => {
            const done = await handoffSession({ ...openDeps(), handoffs: paths.handoffs }, id, {
              note,
              keep,
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
       * Types a prompt into a live session's agent, from another session (`from`, else the window
       * this runs in) when there is one, once the guardrail lets it (`yes`, `force`, and a
       * person's `confirm` past an ask or a block); an action receipt keeps its first 80 chars,
       * the guardrail's decision, and the override.
       */
      send: (
        id: string,
        prompt: string,
        opts: { from?: string; noFrom?: boolean } & Overrides = {},
      ) => {
        const { force = false, yes, confirm, from, noFrom } = opts;
        const kept = receiptText(prompt, deps.argv, secrets());
        return record(
          {
            argv: kept.argv,
            summary: (r) =>
              `Sent ${r.chars} characters to session ${id}${r.from ? ` from ${r.from}` : ''}`,
            failure: `Could not send to session ${id}`,
            warning: (r) => r.warning,
            project: (r) => r.project,
            session: () => id,
            inputs: {
              session: id,
              prompt: kept.short,
              force,
              ...(yes ? { yes } : {}),
              ...(from === undefined ? {} : { from }),
              ...(noFrom ? { noFrom } : {}),
            },
            outputs: (r) => ({
              chars: r.chars,
              from: r.from,
              ...(r.override ? { override: r.override } : {}),
            }),
          },
          // Typed, so the result type comes from the action, as for one that takes nothing.
          (decisions: DecisionRecorder) => {
            const guard = (action: Guarded) =>
              faro.guardrail.gate(action, { force, yes, confirm }, decisions);
            return sendPrompt({ store, tmux, clock: deps.clock, caller, guard }, id, prompt, {
              force,
              from,
              noFrom,
            });
          },
        );
      },
      /**
       * Adopts a Claude Code session Mesa did not start: a record for it, and, unless
       * `noResume`, its conversation reopened in a Mesa window. Its warning is always said.
       */
      adopt: (
        agentSessionId: string,
        opts: { project?: string; name?: string; noResume?: boolean } = {},
      ) =>
        record(
          {
            type: 'session',
            summary: ({ record: r }) =>
              `Adopted Claude Code session ${agentSessionId} as ${r.id} on ${r.project}`,
            failure: `Could not adopt Claude Code session ${agentSessionId}`,
            warning: (r) => r.warning,
            project: (r) => r.record.project,
            session: (r) => r.record.id,
            agent: (r) => r.record.agent,
            inputs: { agentSessionId, ...opts },
            outputs: ({ record: r }) => ({
              window: r.tmux.window,
              resumed: !opts.noResume,
              ...(r.cwd ? { cwd: r.cwd } : {}),
            }),
          },
          () =>
            adoptSession(
              {
                ...openDeps(),
                listing: () => listAgentProcesses(deps),
                elsewhere: () => otherProfilesSessions(deps.home, profile),
                home: deps.home,
              },
              { agentSessionId, ...opts },
            ),
        ),
      /** Reopens a session's conversation in a new window, as a new record linked to the old. */
      resume: (id: string) =>
        record(
          {
            type: 'session',
            summary: (r) => `Resumed session ${r.from.id} as ${r.record.id} on ${r.record.project}`,
            failure: `Could not resume session ${id}`,
            warning: (r) => r.warning,
            project: (r) => r.record.project,
            session: (r) => r.record.id,
            agent: (r) => r.record.agent,
            inputs: { id },
            outputs: (r) => ({
              window: r.record.tmux.window,
              agentSessionId: r.record.agentSessionId,
              resumedFrom: r.from.id,
            }),
          },
          () => resumeSession(openDeps(), id),
        ).then((recorded) => markEnded(ctx, recorded, recorded.result.from)),
      /** Sizes a session's window to a view now (the app's terminal, after each fit). */
      resize: (id: string, cols: number, rows: number) =>
        resizeSession({ store, tmux }, id, cols, rows),
      /** Attaches to a live session: here (the argv to exec), or in config `terminal.app`. */
      attach: (id: string, app = false) =>
        attachSession({ store, tmux, ...terminal }, id, app ? terminalApp() : undefined),
      /**
       * Shows a project's sessions side by side in one terminal, laid out by its mesa.yaml
       * `tmux.layout` (CONTEXT.md, Project view): here (the argv to exec), or in `terminal.app`.
       */
      view: (project: string, app = false) =>
        viewProject(
          { profile: open(), store, tmux, ...terminal },
          project,
          app ? terminalApp() : undefined,
        ),
    },
    hookEvent: ends.hookEvent,
    tmuxEvent: ends.tmuxEvent,
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => tmux.listWindows(project),
  };
}
