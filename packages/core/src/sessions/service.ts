import { claudeTranscripts } from '../agents/claude/paths.js';
import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import { shortId } from '../lib/ids.js';
import { toFail } from '../lib/result.js';
import { projectPriorities } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { receiptText } from '../receipts/command.js';
import { joinWarnings, type Recorded } from '../receipts/recorder.js';
import { closeSessionReceipt } from '../receipts/store.js';
import { adoptSession } from './adopt.js';
import { listAgentProcesses } from './agent-listing.js';
import { attachSession } from './attach.js';
import { listSessions } from './board/board.js';
import { sessionTree } from './board/tree.js';
import { callerOf, windowId } from './caller.js';
import { refreshContext } from './context-use.js';
import { otherProfilesSessions } from './elsewhere.js';
import { readGoal, sessionGoal } from './goal.js';
import { handoffSession } from './handoff.js';
import { readHookEvents, recordHookEvent } from './hook-events.js';
import { type OpenInput, openSession } from './open.js';
import { recordPaneDied } from './pane-died.js';
import { dueToStart, startQueued } from './queue.js';
import { isOver, type SessionRecord } from './record.js';
import { removeSession } from './remove.js';
import { renameSession } from './rename.js';
import { resizeSession } from './resize.js';
import { resumeSession } from './resume.js';
import { sendPrompt } from './send.js';
import { hookState } from './state.js';
import { stopSession } from './stop.js';

// ponytail: a guess at how long a session's agent takes to finish its turn once mesa handoff
// returns; its stop's Escape interrupts whatever it still writes, which is only its goodbye.
/** How long a session that handed itself off keeps running before the server stops it. */
const SELF_STOP_DELAY_S = 2;

/** What a session receipt says of a session that started: its window, conversation, and place. */
const startedOutputs = (r: SessionRecord) => ({
  window: r.tmux.window,
  agentSessionId: r.agentSessionId,
  lastState: r.lastState,
  parent: r.parent ?? null,
  ...(r.worktree ? { worktree: r.worktree } : {}),
});

/**
 * Every session action, each with its receipt, plus the hooks' entry points and the tmux
 * windows: the Session Board's side of Mesa for one profile.
 */
export function sessionsService(
  ctx: MesaContext,
  faro: Faro,
  /** Links a project's enabled skills into a folder (the skills service's). */
  syncSkills: (project: string, folder: string) => void,
) {
  const { profile, deps, paths, open, store, tmux, record, secrets, secretsOrRefuse, absolute } =
    ctx;
  const notes = ctx.notes;
  /**
   * Marks `ended`'s opening receipt ended, best effort: a failure joins the recorded action's
   * warning instead of failing it.
   */
  const markEnded = async <T>(
    recorded: Recorded<T>,
    ended: SessionRecord,
  ): Promise<Recorded<T>> => {
    try {
      const at = new Date(ended.endedAt ?? deps.clock());
      await closeSessionReceipt(notes(), ended.id, at, { lastState: ended.lastState.state });
      return recorded;
    } catch (error) {
      const why = `session ${ended.id}'s receipt not marked ended: ${toFail(error).error.message}`;
      return { ...recorded, warning: joinWarnings(recorded.warning, why) };
    }
  };
  /** Where a session's context use is read: its agent's files under home, with this env. */
  const contextDeps = { store, home: deps.home, env: deps.env };
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
    syncSkills,
  });
  /**
   * Starts, each with its session receipt, the queued sessions waiting on one `over` says is
   * over. A start that fails leaves its failure receipt and a warning, never a failed caller:
   * whether one started, and the warnings.
   */
  const startQueue = async (over: (id: string) => boolean) => {
    let started = false;
    const warnings: (string | undefined)[] = [];
    for (const queued of dueToStart(store, over, deps.clock())) {
      try {
        const recorded = await record(
          {
            type: 'session',
            summary: (r) => `Started queued session ${queued.id} on ${r?.record.project}`,
            failure: `Could not start queued session ${queued.id}`,
            project: () => queued.project,
            session: () => queued.id,
            agent: () => queued.agent,
            inputs: { id: queued.id, after: queued.after },
            outputs: (r) => (r ? startedOutputs(r.record) : {}),
            changed: (r) => r !== undefined,
            warning: (r) => r?.warning,
          },
          () => startQueued(openDeps(), queued.id),
        );
        started ||= Boolean(recorded.result);
        warnings.push(recorded.warning);
      } catch (error) {
        warnings.push(`queued session ${queued.id} did not start: ${toFail(error).error.message}`);
        // It ended failed: its opening receipt (Queued session) is marked ended too.
        const ended = store.find(queued.id);
        if (ended?.endedAt)
          warnings.push((await markEnded({ result: null, receipt: null }, ended)).warning);
      }
    }
    return { started, warning: joinWarnings(...warnings) };
  };
  /** Whether the session `id` is over for its queue: it is, or it is gone. */
  const overOrGone = (id: string) => {
    const found = store.find(id);
    return !found || isOver(found);
  };
  /** The board: sessions merged with live tmux and the agent listing; ended ones only with `all`. */
  const look = (all = false) =>
    listSessions(
      {
        store,
        tmux,
        listing: () => listAgentProcesses(deps.run),
        projects: readRegistry(paths.registry),
        elsewhere: () => otherProfilesSessions(deps.home, profile),
        events: (id) => readHookEvents(paths.events, id),
        priorityOf: projectPriorities(open),
        faro: faro.profile(),
        backends: faro.shared,
        clock: deps.clock,
      },
      { all },
    );
  /**
   * The board, once it has started what it found due: a queued session whose session is over by
   * this look, which a missed signal left waiting.
   */
  const board = async (all = false) => {
    const rows = await look(all);
    const overNow = (id: string) => {
      const row = rows.find((r) => r.id === id);
      return row?.managed ? isOver(row) : overOrGone(id);
    };
    return (await startQueue(overNow)).started ? look(all) : rows;
  };
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
        project: (r) => r.record.project,
        session: () => id,
        agent: (r) => r.record.agent,
        inputs: { id, force },
        outputs: (r) => ({ outcome: r.outcome, lastState: r.record.lastState.state }),
        changed: (r) => r.outcome !== 'already-ended',
      },
      () => stopSession({ store, tmux, clock: deps.clock, sleep: deps.sleep }, id, { force }),
    );
    const { outcome } = recorded.result;
    if (outcome === 'already-ended') return recorded;
    // Stopped is over: what was queued after it starts (a cancel hands its queue on instead).
    const queue = outcome === 'cancelled' ? undefined : await startQueue((after) => after === id);
    const ended = await markEnded(recorded, recorded.result.record);
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
      /** A session's goal, or not_found when it was started without one. */
      goal: (id: string) => sessionGoal(store, id),
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
       * Removes a session's record and hook log, and with the flags its worktree and branch; a
       * live one only with `force`. The session receipt says what went.
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
              { store, tmux, run: deps.run, profile: open, eventsDir: paths.events },
              id,
              opts,
            ),
        ),
      stop,
      /**
       * Continues a session's work in a successor (CONTEXT.md, Handoff), then stops it unless
       * `keep`: at once, or, when the session hands itself off from inside its own window, from
       * the tmux server a moment later, as its own stop would kill this mesa half-way. The
       * handoff's session receipt names both and the note.
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
            if (keep) return { ...done, stop: 'kept' as const };
            // The successor runs now: a stop that fails is a warning, never a failed handoff that
            // a retry would start a second successor for.
            try {
              if (caller().session?.id === id) {
                await tmux.runMesaLater(['stop', id], SELF_STOP_DELAY_S);
                return { ...done, stop: 'later' as const };
              }
              const stopped = await stop(id);
              const warning = joinWarnings(done.warning, stopped.warning);
              return { ...done, stop: stopped.result.outcome, ...(warning ? { warning } : {}) };
            } catch (error) {
              const why = `session ${id} not stopped: ${toFail(error).error.message}; mesa stop ${id}`;
              return { ...done, stop: 'failed' as const, warning: joinWarnings(done.warning, why) };
            }
          },
        );
      },
      /**
       * Types a prompt into a live session's agent, from another session (`from`, else the window
       * this runs in) when there is one; an action receipt keeps its first 80 chars.
       */
      send: (
        id: string,
        prompt: string,
        opts: { force?: boolean; from?: string; noFrom?: boolean } = {},
      ) => {
        const { force = false, from, noFrom } = opts;
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
              ...(from === undefined ? {} : { from }),
              ...(noFrom ? { noFrom } : {}),
            },
            outputs: (r) => ({ chars: r.chars, from: r.from }),
          },
          () =>
            sendPrompt({ store, tmux, clock: deps.clock, caller }, id, prompt, {
              force,
              from,
              noFrom,
            }),
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
                listing: () => listAgentProcesses(deps.run),
                elsewhere: () => otherProfilesSessions(deps.home, profile),
                transcripts: claudeTranscripts(deps.home),
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
        ).then((recorded) => markEnded(recorded, recorded.result.from)),
      /** Sizes a session's window to a view now (the app's terminal, after each fit). */
      resize: (id: string, cols: number, rows: number) =>
        resizeSession({ store, tmux }, id, cols, rows),
      /** Attaches to a live session: here (the argv to exec), or in config `terminal.app`. */
      attach: (id: string, app = false) =>
        attachSession(
          {
            store,
            tmux,
            run: deps.run,
            scripts: paths.attachScripts,
            env: deps.env,
            viewId: () => shortId(deps.newId),
          },
          id,
          app ? open().config.terminal.app : undefined,
        ),
    },
    /**
     * One agent hook's payload, from `mesa hook claude` inside a Mesa session. A Stop reads the
     * session's context use; a SessionEnd (not a /clear or a /resume, which keep the agent
     * running) starts what was queued after it.
     */
    hookEvent: async (agent: string, payload: string) => {
      const event = recordHookEvent(
        {
          store,
          eventsDir: paths.events,
          clock: deps.clock,
          home: deps.home,
          secrets: secretsOrRefuse,
        },
        { agent, mesaSessionId: windowId(deps.env), payload },
      );
      const id = windowId(deps.env);
      // A turn ended: its reply's usage is in the transcript. A hook still logs without a record.
      const ended = event?.event === 'Stop' && id ? store.find(id) : undefined;
      if (ended) refreshContext(contextDeps, ended);
      if (event?.event === 'SessionEnd' && id && hookState(event.event, event.payload)) {
        await startQueue((after) => after === id);
      }
      return event;
    },
    /**
     * A tmux hook's event (`mesa hook tmux <event> <project> <window>`): `pane-died` records the
     * exit of the agent in a Mesa window, then starts what was queued after it; any other event,
     * or a window no session has, is not Mesa's and records nothing (undefined).
     */
    tmuxEvent: async (event: string, project: string, window: string) => {
      if (event !== 'pane-died') return undefined;
      const exited = await recordPaneDied({ store, tmux, clock: deps.clock }, project, window);
      if (exited) await startQueue((after) => after === exited.id);
      return exited;
    },
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => tmux.listWindows(project),
  };
}
