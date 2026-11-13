import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { launchAgent } from '../lib/launch-agent.js';

/** The listener's LaunchAgent as a look finds it: loaded, and which Mesa version it runs. */
export type ListenerState = {
  loaded: boolean;
  /** The version the running listener reported; none while no listener runs. */
  version?: string;
  /** It runs another version than this Mesa's, and a restart did not change that. */
  outdated?: true;
};

/** How long a restart may take before the look reports what still runs. */
const RESTART_WAIT_MS = 5_000;
const RESTART_POLL_MS = 250;

/**
 * The LaunchAgent that runs the Mac's phone listener (`mesa phone serve`, ADR-0027). The running
 * listener writes its pid and version (`running`); `ensure` installs or starts it, and restarts one
 * that runs another Mesa version, so an update's phone fixes reach the phone (#1133). One that runs
 * this version is left alone, so app launches never restart it.
 */
export function phoneListener(
  ctx: Pick<
    MesaContext,
    | 'env'
    | 'home'
    | 'paths'
    | 'profile'
    | 'run'
    | 'self'
    | 'version'
    | 'sleep'
    | 'processId'
    | 'processAlive'
  >,
) {
  const agent = launchAgent(ctx, {
    name: 'phone',
    what: 'phone listener',
    command: ['phone', 'serve'],
    run: 'keep-alive',
    log: 'phone',
  });
  const file = join(ctx.paths.root, 'phone-listener.json');
  /** The live listener's version; undefined when none wrote one or its process is gone. */
  const runningVersion = () => {
    try {
      const { pid, version } = JSON.parse(readFileSync(file, 'utf8'));
      return typeof version === 'string' && ctx.processAlive(pid) ? version : undefined;
    } catch {
      return undefined;
    }
  };
  const state = (loaded: boolean): ListenerState => {
    const version = loaded ? runningVersion() : undefined;
    if (!version) return { loaded };
    return version === ctx.version ? { loaded, version } : { loaded, version, outdated: true };
  };
  return {
    /** Marks this process as the profile's listener, run under the listener's lock. */
    running: () =>
      writeFileAtomic(file, JSON.stringify({ pid: ctx.processId, version: ctx.version }), 0o600),
    ensure: async (): Promise<ListenerState> => {
      if (!agent.exists()) return state((await agent.install()).loaded);
      const found = state((await agent.start()).loaded);
      if (!found.outdated) return found;
      await agent.restart();
      for (let waited = 0; waited < RESTART_WAIT_MS; waited += RESTART_POLL_MS) {
        if (runningVersion() === ctx.version) break;
        await ctx.sleep(RESTART_POLL_MS);
      }
      return state((await agent.status()).loaded);
    },
    remove: () => agent.uninstall(),
  };
}
