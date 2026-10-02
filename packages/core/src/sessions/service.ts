import { existsSync } from 'node:fs';
import { antigravitySessionId } from '../agents/antigravity/log.js';
import { claudeBackgroundAttach } from '../agents/claude/background.js';
import { vaultServer } from '../agents/vault-mount.js';
import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import type { Guarded, Overrides } from '../decisions/guardrail.js';
import type { DecisionRecorder } from '../decisions/types.js';
import { shortId } from '../lib/ids.js';
import { redactText, redactWhole } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { profileService } from '../profile/service.js';
import { projectPriorities } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { receiptText } from '../receipts/command.js';
import { joinWarnings } from '../receipts/recorder.js';
import type { skillsService } from '../skills/service.js';
import { sessionBranchName } from '../worktrees/branch-name.js';
import { adoptSession } from './adopt.js';
import { listAgentProcesses } from './agent-listing.js';
import { attachSession } from './attach.js';
import { listSessions } from './board/board.js';
import { sessionTree } from './board/tree.js';
import { openBrowserExternal } from './browser-address.js';
import {
  type BrowserAnnotationInput,
  clearBrowserElement,
  liveBrowserAnnotation,
  selectBrowserElement,
} from './browser-annotation.js';
import { callerOf } from './caller.js';
import { changeReview, previewChangeReview } from './change-review.js';
import { refreshContext } from './context-use.js';
import { changeDependencies } from './dependencies.js';
import { applyDescendants } from './descendants.js';
import { otherProfilesSessions } from './elsewhere.js';
import { endSignals } from './end-signals.js';
import { forkSession } from './fork.js';
import { GENERAL_PROJECT, projectLabel, projectScope } from './general.js';
import { readGoal, sessionGoal } from './goal.js';
import { type GridGroup, removeGridGroup, saveGridGroup } from './grid-groups.js';
import { handoffSession, stopHandedOff } from './handoff.js';
import { nativeHistory } from './history.js';
import { readHookEvents } from './hook-events.js';
import { previewSessionImage, sessionImagePrompt } from './images.js';
import { instructionStatus } from './instructions.js';
import { launchProject, startSession } from './launch.js';
import { type OpenInput, openSession } from './open.js';
import { outputLog, sessionLog } from './output-log.js';
import { moveBoardSession } from './presentation.js';
import { startQueued } from './queue.js';
import { isOver, recordAgent } from './record.js';
import { removeSession } from './remove.js';
import { renameSession } from './rename.js';
import { resizeSession } from './resize.js';
import { previewResponseReview, sessionResponses } from './responses.js';
import { resumeSession } from './resume.js';
import { sendReview } from './reviews.js';
import { awaitRun, endRun, type RunEnd, type RunInput, startRun } from './run.js';
import { searchConversations } from './search.js';
import { sendPrompt } from './send.js';
import { dangerousLaunch, markEnded, startedOutputs } from './session-receipt.js';
import { stopSession } from './stop.js';
import { swapAgent } from './swap.js';
import { killIfThere } from './tmux/backend.js';
import { vaultStatus } from './vault-status.js';
import { viewProject } from './view.js';
import { windowOf } from './window-name.js';
import { setWorkflowStatus } from './workflow.js';

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
  const setConfig = profileService(ctx).config.set;
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
    env: deps.env,
    clock: deps.clock,
    newUuid: deps.newUuid,
    caller,
    syncSkills: skills.linkInto,
    vaultServer: vaultServer(deps.self),
    shell: deps.env.SHELL || '/bin/zsh',
    home: deps.home,
    self: deps.self,
  });
  const nativeDeps = () => ({
    profile: open(),
    store,
    home: deps.home,
    env: deps.env,
    elsewhere: () => otherProfilesSessions(deps.home, profile),
  });
  /** A closed tmux view does not end its Claude background process; recreate it on demand. */
  const ensureBackgroundView = async (id: string) => {
    const found = store.get(id);
    const nativeId = found.backgroundId;
    if (!nativeId || found.endedAt || isOver(found)) return;
    const target = windowOf(found);
    const pane = await tmux.findWindow(target);
    if (pane && !pane.dead) return;
    if (pane) await killIfThere(tmux, target);
    const project =
      found.project === GENERAL_PROJECT ? null : launchProject(open(), found.project).entry;
    await startSession(openDeps(), found, project, {
      command: () => claudeBackgroundAttach(nativeId),
    });
  };
  /**
   * The board: sessions merged with live tmux and the agent listing; ended ones only with `all`.
   * Without `adapter` it never waits on Faro's adapter, for a look that must be quick.
   */
  const look = (all = false, { adapter = true } = {}) =>
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
        backends: adapter ? faro.shared : [],
        clock: deps.clock,
        env: deps.env,
        home: deps.home,
        logs: paths.logs,
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
              { store, tmux, run: deps.run, clock: deps.clock, sleep: deps.sleep },
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
  const remove = (
    id: string,
    opts: { force?: boolean; deleteWorktree?: boolean; deleteBranch?: boolean } = {},
  ) =>
    record(
      {
        type: 'session',
        summary: (r) =>
          `Removed session ${id}${r.worktree ? ', its worktree' : ''}${r.branch ? `, branch ${r.branch}` : ''}`,
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
            run: deps.run,
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
  const send = (
    id: string,
    prompt: string,
    opts: { from?: string; noFrom?: boolean } & Overrides = {},
  ) => {
    const { force = false, yes, confirm, from, noFrom } = opts;
    const kept = receiptText(prompt, deps.argv, secrets());
    const target = store.find(id);
    return record(
      {
        kind: 'guardrail',
        scope: {
          project: target?.project,
          session: target?.id,
          agent: target ? recordAgent(target) : undefined,
          actor: caller().session?.id,
        },
        argv: kept.argv,
        summary: (r) =>
          `Sent ${r.chars} characters to session ${id}${r.from ? ` from ${r.from}` : ''}`,
        failure: `Could not send to session ${id}`,
        warning: (r) => r.warning,
        project: (r) => projectScope(r.project),
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
      async (decisions: DecisionRecorder) => {
        const guard = (action: Guarded) =>
          faro.guardrail.gate(action, { force, yes, confirm }, decisions);
        await ensureBackgroundView(id);
        return sendPrompt({ store, tmux, clock: deps.clock, caller, guard }, id, prompt, {
          force,
          from,
          noFrom,
        });
      },
    );
  };
  return {
    grid: {
      list: () => open().config.grid.groups,
      save: (group: GridGroup) => {
        const groups = saveGridGroup(open().config.grid.groups, group);
        const recorded = setConfig('grid.groups', JSON.stringify(groups));
        return { ...recorded, result: { groups } };
      },
      remove: (name: string) => {
        const groups = removeGridGroup(open().config.grid.groups, name);
        const recorded = setConfig('grid.groups', JSON.stringify(groups));
        return { ...recorded, result: { groups } };
      },
    },
    sessions: {
      list: board,
      images: {
        preview: (id: string, path: string) =>
          previewSessionImage({ profile, store, absolute }, id, path),
        prompt: (
          id: string,
          path: string,
          revision: string,
          expectedProfile: string,
          note?: string,
        ) =>
          sessionImagePrompt(
            { profile, store, absolute },
            id,
            path,
            revision,
            expectedProfile,
            note,
          ),
      },
      responses: {
        list: (id: string) =>
          sessionResponses({ profile, store, home: deps.home, env: deps.env }, id),
        preview: (id: string, input: Parameters<typeof previewResponseReview>[2]) =>
          previewResponseReview({ profile, store, home: deps.home, env: deps.env }, id, input),
        send: (
          id: string,
          input: Parameters<typeof previewResponseReview>[2],
          opts: { noFrom?: boolean } & Overrides = {},
        ) =>
          sendReview(
            { store, clock: deps.clock, send },
            id,
            'response',
            () =>
              previewResponseReview({ profile, store, home: deps.home, env: deps.env }, id, input),
            opts,
          ),
      },
      changes: {
        read: (id: string, path: string, staged = false) =>
          changeReview({ profile, store, open, run: deps.run }, id, path, staged),
        preview: (id: string, input: Parameters<typeof previewChangeReview>[2]) =>
          previewChangeReview({ profile, store, open, run: deps.run }, id, input),
        send: (
          id: string,
          input: Parameters<typeof previewChangeReview>[2],
          opts: { noFrom?: boolean } & Overrides = {},
        ) =>
          sendReview(
            { store, clock: deps.clock, send },
            id,
            'change',
            () => previewChangeReview({ profile, store, open, run: deps.run }, id, input),
            opts,
          ),
      },
      browser: {
        external: (url: string) => openBrowserExternal(url, deps.run),
        select: (id: string, input: Parameters<typeof selectBrowserElement>[2]) =>
          selectBrowserElement({ profile, store }, id, input),
        clear: (id: string) => clearBrowserElement({ store }, id),
        preview: (id: string, input: BrowserAnnotationInput) =>
          liveBrowserAnnotation(
            {
              profile,
              store,
              processAlive: deps.processAlive,
              liveSelection: deps.browserSelection,
            },
            id,
            input,
          ),
        send: (
          id: string,
          input: BrowserAnnotationInput & {
            source: string;
            revision: string;
          },
          opts: { noFrom?: boolean } & Overrides = {},
        ) =>
          sendReview(
            { store, clock: deps.clock, send },
            id,
            'browser',
            () =>
              liveBrowserAnnotation(
                {
                  profile,
                  store,
                  processAlive: deps.processAlive,
                  liveSelection: deps.browserSelection,
                },
                id,
                input,
              ),
            opts,
          ),
      },
      /** The board as a tree: children under their parent, each row with its depth. */
      tree: async (all = false, opts: { adapter?: boolean } = {}) =>
        sessionTree(await board(all, opts)),
      moveOnBoard: async (id: string, direction: -1 | 1) => {
        const order = moveBoardSession(
          await sessionTree(await board()),
          open().config.board,
          id,
          direction,
        );
        const recorded = setConfig('board.order', JSON.stringify(order));
        return { ...recorded, result: { order } };
      },
      /**
       * Starts `agent` (else the project's, else the profile's) in a new window, with the goal
       * as its first prompt, and with `branch`, in its own git worktree. The goal is read first,
       * so the receipt keeps it (receiptText); one Mesa cannot take fails inside the recorded
       * action, as every refusal does.
       */
      open: (
        project: string | undefined,
        opts: Omit<OpenInput, 'project'> & { goalFile?: string; worktree?: boolean } = {},
      ) => {
        const { agent, mode, background, parent, noParent, after, base, terminal, general } = opts;
        let refused: unknown =
          opts.worktree && opts.branch !== undefined
            ? new MesaError('usage', 'pass --worktree or --branch, not both')
            : undefined;
        // A worktree of its own on a branch Mesa names (sessionBranchName).
        const branch = opts.worktree && !refused ? sessionBranchName(deps.newId) : opts.branch;
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
        const kept = text === undefined ? undefined : receiptText(text, deps.argv, secrets());
        return record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            ...(kept ? { argv: kept.argv } : {}),
            summary: ({ record: r }) =>
              r.lastState.state === 'queued'
                ? `Queued session ${r.id} on ${projectLabel(r.project)} after ${r.after}`
                : `Opened session ${r.id} on ${projectLabel(r.project)}`,
            failure: `Could not open a session on ${project ?? 'General'}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: (r) => r.record.id,
            agent: (r) => recordAgent(r.record),
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
            },
            outputs: ({ record: r }) => startedOutputs(r, open().config.agents),
          },
          async () => {
            if (refused) throw refused;
            const input = {
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
       * One session's record, its context use read now, with `alive` as the board reads it, and
       * whether its instruction hook and its mesa-vault mount are configured; not_found for an
       * unknown id.
       */
      show: async (id: string) => {
        store.get(id);
        const row = (await board(true)).find((r) => r.id === id);
        // The look may have learned a provider-owned ID before its context can be read.
        refreshContext(contextDeps, store.get(id));
        // Read again: the look may have saved a new state, or started it from its queue.
        const current = store.get(id);
        const latestAntigravityId =
          current.agent === 'antigravity'
            ? antigravitySessionId({ logs: paths.logs }, current, new Set(), true)
            : undefined;
        const identityEvents = readHookEvents(paths.events, id);
        return {
          ...current,
          alive: row?.alive ?? false,
          instructions: instructionStatus(
            current.agent,
            deps.home,
            deps.env,
            deps.self,
            identityEvents.some((event) => event.event === 'SessionIdentityChanged') ||
              Boolean(
                current.agentSessionId &&
                  latestAntigravityId &&
                  latestAntigravityId !== current.agentSessionId,
              ) ||
              (identityEvents.some((event) => event.event === 'SessionIdentityAmbiguous')
                ? 'ambiguous'
                : false),
          ),
          vault: vaultStatus(current, deps.home, deps.self),
        };
      },
      /** Gives a session the name a person calls it by; the board shows it in place of the id. */
      rename: (id: string, name: string) =>
        record(
          {
            type: 'session',
            summary: (r) => `Renamed session ${id} to ${r.name}`,
            failure: `Could not rename session ${id}`,
            project: (r) => projectScope(r.project),
            session: () => id,
            inputs: { id, name },
            outputs: (r) => ({ name: r.name }),
          },
          () => renameSession(store, id, name),
        ),
      workflow: (id: string, status: string) =>
        record(
          {
            type: 'session',
            summary: (r) => `Set session ${id} workflow to ${r.workflowStatus ?? 'unassigned'}`,
            failure: `Could not set session ${id} workflow`,
            project: (r) => projectScope(r.project),
            session: () => id,
            inputs: { id, status },
            outputs: (r) => ({ workflowStatus: r.workflowStatus ?? null }),
          },
          () => setWorkflowStatus(store, id, status),
        ),
      /**
       * Removes a session's record, hook log, output log, and a run's output, and with the flags
       * its worktree and branch; a live one only with `force`. The session receipt says what went.
       */
      remove,
      removeDescendants: (
        id: string,
        opts: { force?: boolean; deleteWorktree?: boolean; deleteBranch?: boolean } = {},
        expected?: readonly string[],
      ) =>
        applyDescendants(
          store.list(),
          id,
          async (session) => {
            const recorded = await remove(session.id, {
              force: opts.force,
              ...(session.worktree
                ? { deleteWorktree: opts.deleteWorktree, deleteBranch: opts.deleteBranch }
                : {}),
            });
            return { ...recorded.result, receipt: recorded.receipt, warning: recorded.warning };
          },
          expected,
        ),
      archive: async (id: string) => {
        const found = store.get(id);
        if (!found.archivedAt && !found.endedAt) await stop(id, true);
        return record(
          {
            type: 'session',
            summary: () => `Archived session ${id}`,
            failure: `Could not archive session ${id}`,
            project: (r) => projectScope(r.project),
            session: () => id,
            agent: (r) => recordAgent(r),
            inputs: { id },
            outputs: (r) => ({ archivedAt: r.archivedAt }),
            changed: () => !found.archivedAt,
          },
          () =>
            store.update(id, (current) => ({
              archivedAt: current.archivedAt ?? deps.clock().toISOString(),
            })),
        );
      },
      unarchive: (id: string) => {
        const found = store.get(id);
        return record(
          {
            type: 'session',
            summary: () => `Unarchived session ${id}`,
            failure: `Could not unarchive session ${id}`,
            project: (r) => projectScope(r.project),
            session: () => id,
            agent: (r) => recordAgent(r),
            inputs: { id },
            outputs: () => ({ archivedAt: null }),
            changed: () => Boolean(found.archivedAt),
          },
          () => store.update(id, { archivedAt: undefined }),
        );
      },
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
      /**
       * Continues a session's work in a successor (CONTEXT.md, Handoff), then stops it unless
       * `keep` (stopHandedOff). The handoff's session receipt names both and the note.
       */
      handoff: (id: string, opts: { note: string; keep?: boolean; agent?: string }) => {
        const note = absolute(opts.note);
        const keep = opts.keep ?? false;
        return record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: (r) => `Handed off session ${id} to ${r.to.id} (${r.stop})`,
            failure: `Could not hand off session ${id}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.to.project),
            session: () => id,
            agent: (r) => recordAgent(r.to),
            inputs: { id, note, keep, ...(opts.agent ? { agent: opts.agent } : {}) },
            outputs: (r) => ({
              from: id,
              to: r.to.id,
              note: r.note,
              stop: r.stop,
              ...dangerousLaunch(r.to, open().config.agents),
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
       * Types a prompt into a live session's agent, from another session (`from`, else the window
       * this runs in) when there is one, once the guardrail lets it (`yes`, `force`, and a
       * person's `confirm` past an ask or a block). A blocked or overridden guardrail keeps its
       * decision and the prompt's first 80 characters.
       */
      send,

      /**
       * Adopts a Claude Code or Codex session Mesa did not start: a record for it, and, unless
       * `noResume`, its conversation reopened in a Mesa window. Its warning is always said.
       */
      adopt: (
        agentSessionId: string,
        opts: { project?: string; name?: string; noResume?: boolean } = {},
      ) =>
        record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: ({ record: r }) =>
              `Adopted ${r.agent} session ${agentSessionId} as ${r.id} on ${r.project}`,
            failure: `Could not adopt native session ${agentSessionId}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: (r) => r.record.id,
            agent: (r) => recordAgent(r.record),
            inputs: { agentSessionId, ...opts },
            outputs: ({ record: r }) => ({
              window: r.tmux.window,
              resumed: !opts.noResume,
              ...(r.cwd ? { cwd: r.cwd } : {}),
              ...(opts.noResume ? {} : dangerousLaunch(r, open().config.agents)),
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
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: (r) =>
              `Resumed session ${r.from.id} as ${r.record.id} on ${projectLabel(r.record.project)}`,
            failure: `Could not resume session ${id}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: (r) => r.record.id,
            agent: (r) => recordAgent(r.record),
            inputs: { id },
            outputs: (r) => ({
              window: r.record.tmux.window,
              agentSessionId: r.record.agentSessionId,
              resumedFrom: r.from.id,
              ...dangerousLaunch(r.record, open().config.agents),
            }),
          },
          () => resumeSession(openDeps(), id),
        ).then((recorded) => markEnded(ctx, recorded, recorded.result.from)),
      /** A fresh session's agent swapped in place (CONTEXT.md, Swap), with its receipt. */
      swap: (id: string, agent: string) =>
        record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: (r) => `Swapped session ${r.record.id} to ${r.record.agent}`,
            failure: `Could not swap session ${id} to ${agent}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: (r) => r.record.id,
            agent: (r) => recordAgent(r.record),
            inputs: { id, agent },
            outputs: (r) => ({
              window: r.record.tmux.window,
              agentSessionId: r.record.agentSessionId,
              ...dangerousLaunch(r.record, open().config.agents),
            }),
          },
          () => swapAgent({ ...openDeps(), eventsDir: paths.events }, id, agent),
        ).then((recorded) => ({ ...recorded, result: recorded.result.record })),
      fork: (id: string, opts: { branch?: string; base?: string } = {}) =>
        record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: (r) => `Forked session ${id} as ${r.record.id}`,
            failure: `Could not fork session ${id}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: (r) => r.record.id,
            agent: (r) => recordAgent(r.record),
            inputs: { id, ...opts },
            outputs: (r) => ({
              window: r.record.tmux.window,
              parent: id,
              ...dangerousLaunch(r.record, open().config.agents),
            }),
          },
          () => forkSession(openDeps(), id, opts),
        ).then((recorded) => ({ ...recorded, result: recorded.result.record })),
      dependencies: (id: string, change: { parent?: string | null; after?: string }) =>
        record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: (r) => `Updated dependencies of session ${r.record.id}`,
            failure: `Could not update dependencies of session ${id}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: () => id,
            inputs: { id, ...change },
            outputs: (r) => ({
              parent: r.record.parent ?? null,
              after: r.record.after ?? null,
              ...(r.started ? dangerousLaunch(r.record, open().config.agents) : {}),
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
        record(
          {
            // A start with dangerous launch flags is kept (dangerousLaunch).
            kind: 'guardrail',
            type: 'session',
            summary: (r) => `Started queued session ${r.record.id} now`,
            failure: `Could not force-start session ${id}`,
            warning: (r) => r.warning,
            project: (r) => projectScope(r.record.project),
            session: () => id,
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
      /** Sizes a session's window to a view now (the app's terminal, after each fit). */
      resize: (id: string, cols: number, rows: number) =>
        resizeSession({ store, tmux }, id, cols, rows),
      /** Attaches to a live session: here (the argv to exec), or in config `terminal.app`. */
      attach: async (id: string, app = false) => {
        await ensureBackgroundView(id);
        return attachSession(
          {
            store,
            tmux,
            ...terminal,
            naturalSelection: open().config.terminal.naturalSelection,
            wezTermNewTab: open().config.terminal.wezTermNewTab,
          },
          id,
          app ? terminalApp() : undefined,
        );
      },
      /**
       * Shows a project's sessions side by side in one terminal, laid out by its mesa.yaml
       * `tmux.layout` (CONTEXT.md, Project view): here (the argv to exec), or in `terminal.app`.
       */
      view: (project: string, app = false) =>
        viewProject(
          {
            profile: open(),
            store,
            tmux,
            ...terminal,
            wezTermNewTab: open().config.terminal.wezTermNewTab,
          },
          project,
          app ? terminalApp() : undefined,
        ),
      /** Native provider conversations on disk for a project, with import ownership. */
      history: (project: string) => nativeHistory(nativeDeps(), project),
      /** Bounded local text search over native provider conversations. */
      search: (project: string, query: string) => searchConversations(nativeDeps(), project, query),
    },
    hookEvent: ends.hookEvent,
    antigravityInstruction: ends.antigravityInstruction,
    tmuxEvent: ends.tmuxEvent,
    /** The windows on the profile's tmux server, or one project's. */
    windows: (project?: string) => tmux.listWindows(project),
  };
}
