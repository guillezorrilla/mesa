import { claudeTranscripts } from '../agents/claude/paths.js';
import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import { toFail } from '../lib/result.js';
import { projectPriorities } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { closeSessionReceipt, type Recorded, receiptText } from '../receipts/receipts.js';
import { adoptSession } from './adopt.js';
import { listAgentProcesses } from './agent-listing.js';
import { attachSession } from './attach.js';
import { listSessions } from './board/board.js';
import { sessionTree } from './board/tree.js';
import { callerOf, windowId } from './caller.js';
import { otherProfilesSessions } from './elsewhere.js';
import { readGoal, sessionGoal } from './goal.js';
import { readHookEvents, recordHookEvent } from './hook-events.js';
import { type OpenInput, openSession } from './open.js';
import { recordPaneDied } from './pane-died.js';
import type { SessionRecord } from './record.js';
import { resizeSession } from './resize.js';
import { resumeSession } from './resume.js';
import { sendPrompt } from './send.js';
import { stopSession } from './stop.js';

/**
 * Every session action, each with its receipt, plus the hooks' entry points and the tmux
 * windows: the Session Board's side of Mesa for one profile.
 */
export function sessionsService(ctx: MesaContext, faro: Faro) {
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
      return { ...recorded, warning: [recorded.warning, why].filter(Boolean).join('; ') };
    }
  };
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
  });
  /** The board: sessions merged with live tmux and the agent listing; ended ones only with `all`. */
  const board = (all = false) =>
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
        const { agent, parent, noParent, branch, base } = opts;
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
            summary: (r) => `Opened session ${r.id} on ${r.project}`,
            failure: `Could not open a session on ${project}`,
            project: (r) => r.project,
            session: (r) => r.id,
            agent: (r) => r.agent,
            inputs: {
              project,
              agent: agent ?? null,
              ...(kept ? { goal: kept.short } : {}),
              ...(parent === undefined ? {} : { parent }),
              ...(noParent ? { noParent } : {}),
              ...(branch === undefined ? {} : { branch }),
              ...(base === undefined ? {} : { base }),
            },
            outputs: (r) => ({
              window: r.tmux.window,
              agentSessionId: r.agentSessionId,
              lastState: r.lastState,
              parent: r.parent ?? null,
              ...(r.worktree ? { worktree: r.worktree } : {}),
            }),
          },
          async () => {
            if (refused) throw refused;
            const input = { project, agent, goal, parent, noParent, branch, base };
            return openSession(openDeps(), input);
          },
        );
      },
      /** A session's goal, or not_found when it was started without one. */
      goal: (id: string) => sessionGoal(store, id),
      /**
       * Ends a session politely, or at once with `force`. The stop gets a session receipt of its
       * own (none when it changed nothing), and the session's opening receipt is marked ended.
       */
      stop: async (id: string, force = false) => {
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
        if (recorded.result.outcome === 'already-ended') return recorded;
        return markEnded(recorded, recorded.result.record);
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
        ).then((recorded) => {
          const { warning } = recorded.result;
          const joined = [recorded.warning, warning].filter(Boolean).join('; ');
          return markEnded(
            { ...recorded, ...(joined ? { warning: joined } : {}) },
            recorded.result.from,
          );
        }),
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
            viewId: () => deps.newId().slice(-8).toLowerCase(),
          },
          id,
          app ? open().config.terminal.app : undefined,
        ),
    },
    /** One agent hook's payload, from `mesa hook claude` inside a Mesa session. */
    hookEvent: (agent: string, payload: string) =>
      recordHookEvent(
        {
          store,
          eventsDir: paths.events,
          clock: deps.clock,
          home: deps.home,
          secrets: secretsOrRefuse,
        },
        { agent, mesaSessionId: windowId(deps.env), payload },
      ),
    /** tmux's pane-died hook: the agent in a Mesa window exited (`mesa hook tmux pane-died`). */
    paneDied: (project: string, window: string) =>
      recordPaneDied({ store, tmux, clock: deps.clock }, project, window),
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => tmux.listWindows(project),
  };
}
