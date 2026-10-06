import { existsSync } from 'node:fs';
import { claudeBackgroundAttach } from '../../agents/claude/background.js';
import { listAgentProcesses } from '../../agents/listing.js';
import { vaultServer } from '../../agents/vault-mount.js';
import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import type { Guarded, Override } from '../../decisions/guardrail.js';
import { shortId } from '../../lib/ids.js';
import { redactWhole } from '../../lib/redact.js';
import { projectPriorities } from '../../projects/projects.js';
import { readRegistry } from '../../projects/registry.js';
import type { skillsService } from '../../skills/service.js';
import { listSessions } from '../board/board.js';
import { callerOf } from '../caller.js';
import { otherProfilesSessions } from '../elsewhere.js';
import { endSignals } from '../end-signals.js';
import { GENERAL_PROJECT } from '../general.js';
import { readHookEvents } from '../hook-events.js';
import { launchProject, startSession } from '../launch.js';
import { outputLog } from '../output-log.js';
import { isOver } from '../record.js';
import { killIfThere } from '../tmux/backend.js';
import { windowOf } from '../window-name.js';

/** The skills service's: links a project's enabled skills into a folder, and lists what it sees. */
export type SessionSkills = Pick<ReturnType<typeof skillsService>, 'linkInto' | 'list'>;

/** What the sessions service's areas share for one profile (sessionDeps). */
export type SessionDeps = ReturnType<typeof sessionDeps>;

/**
 * What each session action takes, built once for one profile: a launch's, an adoption's, a
 * native read's, a terminal's, the board, and the signals that a session ended.
 */
export function sessionDeps(ctx: MesaContext, faro: Faro, skills: SessionSkills) {
  const { profile, paths, open, store, tmux, secrets } = ctx;
  /** Where a session's context use is read: its agent's files under home, with this env. */
  const contextDeps = { store, home: ctx.home, env: ctx.env };
  /** What a terminal on a window takes: the user's terminal app, and a fresh view id each. */
  const terminal = {
    run: ctx.run,
    scripts: paths.attachScripts,
    env: ctx.env,
    viewId: () => shortId(ctx.newId),
  };
  const terminalApp = () => open().config.terminal.app;
  /** Who runs this mesa: the session whose Mesa window it is in, if any. */
  const caller = () => callerOf({ store, env: ctx.env, profileName: profile });
  /** The agent session ids the home's other profiles hold, so theirs are not foreign here. */
  const elsewhere = () => otherProfilesSessions(ctx.home, profile, ctx);
  const openDeps = () => ({
    profile: open(),
    profileName: profile,
    store,
    tmux,
    run: ctx.run,
    env: ctx.env,
    clock: ctx.clock,
    newUuid: ctx.newUuid,
    caller,
    syncSkills: skills.linkInto,
    vaultServer: vaultServer(ctx.self),
    shell: ctx.env.SHELL || '/bin/zsh',
    home: ctx.home,
    self: ctx.self,
    lock: ctx,
  });
  /** What an adoption takes: a launch's, the agent listing, and the other profiles' sessions. */
  const adoptDeps = () => ({
    ...openDeps(),
    listing: () => listAgentProcesses(ctx),
    elsewhere,
  });
  const nativeDeps = () => ({
    profile: open(),
    store,
    home: ctx.home,
    env: ctx.env,
    elsewhere,
  });
  /** What a skill run takes: a launch's, its prompt's guardrail, and where its files go. */
  const runDeps = (skill: string, guard: (action: Guarded) => Promise<Override | undefined>) => ({
    ...openDeps(),
    // A pipeline skill is enabled, and linked, for its own run (skills service).
    syncSkills: (on: string, folder: string) => skills.linkInto(on, folder, skill),
    runs: paths.runs,
    logs: paths.logs,
    lock: ctx,
    redact: (text: string) => redactWhole(text, ctx.home, secrets()),
    skills: (on: string) => skills.list(on, skill),
    guard,
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
  /** The board: sessions merged with live tmux and the agent listing; ended ones only with `all`. */
  const look = (all = false) =>
    listSessions(
      {
        store,
        tmux,
        listing: () => listAgentProcesses(ctx),
        projects: readRegistry(paths.registry),
        elsewhere,
        events: (id) => readHookEvents(paths.events, id),
        priorityOf: projectPriorities(open),
        faro: faro.profile(),
        clock: ctx.clock,
        env: ctx.env,
        home: ctx.home,
        logs: paths.logs,
      },
      { all },
    ).then((rows) =>
      rows.map((row) =>
        row.managed ? { ...row, hasOutputLog: existsSync(outputLog(paths.logs, row.id)) } : row,
      ),
    );
  const ends = endSignals(ctx, { look, launch: openDeps, context: contextDeps });
  return {
    contextDeps,
    terminal,
    terminalApp,
    caller,
    openDeps,
    adoptDeps,
    nativeDeps,
    runDeps,
    ensureBackgroundView,
    ends,
  };
}
