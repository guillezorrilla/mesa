import { listAgentProcesses } from '../../agents/listing.js';
import { launchMounts } from '../../agents/mesa-mount.js';
import type { MesaContext } from '../../context.js';
import type { Faro } from '../../decisions/faro.js';
import type { Guarded, Override } from '../../decisions/guardrail.js';
import type { DecisionAssistance } from '../../decisions/service.js';
import { shortId } from '../../lib/ids.js';
import { redactWhole } from '../../lib/redact.js';
import type { skillsService } from '../../skills/service.js';
import { otherProfilesSessions } from '../board/elsewhere.js';
import { endSignals } from '../end/end-signals.js';
import { callerOf } from '../window/caller.js';
import { backgroundView } from './background-view.js';
import { boardLook } from './board.js';

/** The skills service's: links a project's enabled skills into a folder, and lists what it sees. */
export type SessionSkills = Pick<ReturnType<typeof skillsService>, 'linkInto' | 'list'>;

/** Decision assistance as sessions use it: a turn's advice, and what a session's status reads. */
export type SessionAssistance = Pick<DecisionAssistance, 'advise' | 'assistState'>;

/** What the sessions service's areas share for one profile (sessionDeps). */
export type SessionDeps = ReturnType<typeof sessionDeps>;

/**
 * What each session action takes, built once for one profile: a launch's, an adoption's, a
 * native read's, a terminal's, the board, and the signals that a session ended.
 */
export function sessionDeps(
  ctx: MesaContext,
  faro: Faro,
  skills: SessionSkills,
  assistance: SessionAssistance,
) {
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
    // mesa-decisions only while the profile has a Decision model (ADR-0019, #463).
    mounts: launchMounts(ctx.self, {
      decisions: (ctx.configIfAny()?.decisions.model ?? 'none') !== 'none',
    }),
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
  /** A background session's tmux view, recreated on demand (background-view.ts). */
  const ensureBackgroundView = backgroundView(ctx, openDeps);
  /** A look at the board (board.ts). */
  const look = boardLook(ctx, faro, elsewhere);
  const ends = endSignals(ctx, { look, launch: openDeps, context: contextDeps, assistance });
  return {
    assistance,
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
