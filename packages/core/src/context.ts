import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Clock } from './lib/clock.js';
import type { IdSource } from './lib/ids.js';
import type { Env, Runner } from './lib/process.js';
import { type Config, resolveKey } from './profile/config.js';
import { profilePaths } from './profile/paths.js';
import { openProfile, type Profile } from './profile/profile.js';
import { actionRecorder, redactCommand } from './receipts/receipts.js';
import { sessionStore } from './sessions/store.js';
import { tmuxBackend } from './sessions/tmux/backend.js';
import type { ObsidianPaths } from './vault/obsidian.js';

/** Everything Mesa takes from the outside world. Only an entrypoint builds the real one. */
export type MesaDeps = {
  home: string;
  /** Resolves relative paths the user types. */
  cwd: string;
  clock: Clock;
  newId: IdSource;
  /** Random v4 UUIDs: the agent session id Mesa hands to claude --session-id. */
  newUuid: IdSource;
  /** The argv that runs this mesa, for the agent hooks that call back into it. */
  self: readonly string[];
  /** Waits, for polling tmux: a real timer in the CLI, instant in tests. */
  sleep: (ms: number) => Promise<void>;
  /** For `env:VAR` key values, so a receipt can redact them too. */
  env: Env;
  run: Runner;
  obsidian: ObsidianPaths;
  /** This invocation's arguments, recorded (key values redacted) in every receipt. */
  argv: readonly string[];
};

/**
 * What every domain's services share for one profile: its paths and config, the secrets
 * receipts redact, the receipt recorder, the session store, and the tmux backend. Built once by
 * createMesa, the composition root (ADR-0008).
 */
export function createContext(profile: string, deps: MesaDeps) {
  const paths = profilePaths(deps.home, profile);
  const open = (): Profile => openProfile(paths);
  const vaultOf = () => open().config.vault;
  /** The profile's config if it is initialised: receipts are best effort, so no error here. */
  const configIfAny = (): Config | undefined => {
    try {
      return open().config;
    } catch {
      return undefined;
    }
  };
  /**
   * Both the stored key values and what their env: references resolve to. None when the config
   * does not read: receipts and the adapter, the writes that use these, need that config to run.
   */
  const secrets = () => {
    const config = configIfAny();
    const names = Object.keys(config?.keys ?? {});
    return names
      .flatMap((n) => [config?.keys[n], config && resolveKey(config, n, deps.env)])
      .filter((s): s is string => typeof s === 'string');
  };
  const tmux = tmuxBackend({
    run: deps.run,
    socket: paths.tmuxSocket,
    env: deps.env,
    paneDied: { self: deps.self, profile },
  });
  return {
    profile,
    deps,
    paths,
    open,
    configIfAny,
    vaultOf,
    /** What the vault's notes need: the vault, and the clock for their times. */
    notes: () => ({ vault: vaultOf(), clock: deps.clock }),
    /** A path the user typed, resolved against the working directory. */
    absolute: (path: string) => resolve(deps.cwd, path),
    secrets,
    /**
     * secrets(), for a write that needs no config (a hook's log): a config that does not read
     * refuses the write, so no key it would have hidden is written.
     */
    secretsOrRefuse: () => {
      if (existsSync(paths.config)) open();
      return secrets();
    },
    record: actionRecorder({
      profile,
      vault: () => configIfAny()?.vault,
      clock: deps.clock,
      newId: deps.newId,
      command: (argv = deps.argv) => redactCommand(argv, secrets()),
    }),
    store: sessionStore({ dir: paths.sessions, newId: deps.newId }),
    tmux,
    /** The pane-died hook on the profile's tmux server, and whether a server runs there. */
    tmuxHook: async () => ({ socket: paths.tmuxSocket, ...(await tmux.paneDiedHookState()) }),
  };
}

export type MesaContext = ReturnType<typeof createContext>;
