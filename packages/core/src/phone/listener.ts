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
 * listener records its pid and version (`markRunning`); `ensure` installs or starts it, and restarts
 * one that runs another Mesa version, so an update's phone fixes reach the phone (#1133). One that
 * runs this version is left alone, so app launches never restart it.
 */
export function phoneListener(
  ctx: Pick<
    MesaContext,
    'env' | 'home' | 'paths' | 'profile' | 'run' | 'self' | 'version' | 'sleep' | 'processId'
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
  /** The version the listener running as `pid` recorded; undefined when it recorded none. */
  const versionOf = (pid: number | undefined) => {
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'));
      return pid && record.pid === pid && typeof record.version === 'string'
        ? (record.version as string)
        : undefined;
    } catch {
      return undefined;
    }
  };
  const state = ({ loaded, pid }: { loaded: boolean; pid?: number }): ListenerState => {
    const version = versionOf(pid);
    if (!version) return { loaded };
    return version === ctx.version ? { loaded, version } : { loaded, version, outdated: true };
  };
  return {
    /** Records this process as the profile's listener, with its version; run under the lock. */
    markRunning: () =>
      writeFileAtomic(file, JSON.stringify({ pid: ctx.processId, version: ctx.version }), 0o600),
    ensure: async (): Promise<ListenerState> => {
      if (!agent.exists()) return state(await agent.install());
      const found = await agent.status();
      // Not running: started, it runs this version.
      if (!found.pid) return state(await agent.start());
      // A running listener that recorded no version is from a Mesa before #1133: older too. Only
      // the CLI the plist names restarts it, so another build's or worktree's CLI never flaps it.
      // ponytail: two looks at once (launch and Settings) may both restart it; the last one wins.
      if (versionOf(found.pid) === ctx.version || !agent.runsThisCli()) return state(found);
      await agent.restart();
      for (let waited = 0; waited < RESTART_WAIT_MS; waited += RESTART_POLL_MS) {
        await ctx.sleep(RESTART_POLL_MS);
        const now = await agent.status();
        if (now.pid && versionOf(now.pid) === ctx.version) return state(now);
      }
      return state(await agent.status());
    },
    remove: () => agent.uninstall(),
  };
}
