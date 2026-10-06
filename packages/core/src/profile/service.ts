import { isDeepStrictEqual } from 'node:util';
import type { MesaContext } from '../context.js';
import { REDACTED, redactWhole } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { callerOf } from '../sessions/caller.js';
import { acceptsMesaWrites, initVault } from '../vault/vault.js';
import { APPROVAL_FROM_SESSION, WORKTREE_SCRIPTS } from '../worktrees/approval.js';
import { backupService } from './backup.js';
import { type Config, loadConfig, redactConfig, setConfigValue } from './config.js';
import { initProfile, type ProfileInfo } from './profile.js';

/** The profile itself: what it is, making it, and its config. */
export function profileService(ctx: MesaContext) {
  const { profile, paths, record } = ctx;
  // Worktree setup and teardown run on this machine, so a Mesa session (an agent's shell) cannot
  // change the profile's, by their own path or through a parent such as `worktrees`.
  const scriptGuard = () => {
    if (!callerOf({ store: ctx.store, env: ctx.deps.env, profileName: profile }).inMesaWindow)
      return undefined;
    const before = currentScripts(paths.config);
    return (next: Config) => {
      for (const script of WORKTREE_SCRIPTS)
        if (!isDeepStrictEqual(next.worktrees[script], before[script]))
          throw new MesaError('usage', APPROVAL_FROM_SESSION);
    };
  };
  return {
    info: (): ProfileInfo => ({ profile, dir: paths.root }),
    backup: backupService(ctx),
    init: (input: { vault: string; agent?: string }) => {
      const vault = ctx.absolute(input.vault);
      return record(
        {
          summary: () => `Initialised profile ${profile}`,
          failure: `Could not initialise profile ${profile}`,
          inputs: { vault, agent: input.agent ?? null },
          outputs: (r) => ({ config: r.path, vaultCreated: r.vaultCreated }),
          changed: (r) => r.created,
        },
        () => {
          const made = initProfile(paths, { ...input, vault });
          // A new profile starts with its vault laid out, as `mesa vault init` would; a folder Mesa
          // may not write into is left for `mesa vault init --force`.
          const vaultCreated = acceptsMesaWrites(vault)
            ? initVault({ path: vault, clock: ctx.deps.clock }).created
            : [];
          return { ...made, vaultCreated };
        },
      );
    },
    config: {
      /** Redacted: key values are `***`. */
      get: () => redactConfig(ctx.open().config),
      set: (dotted: string, value: string) => {
        const previousVault = dotted === 'vault' ? ctx.configIfAny()?.vault : undefined;
        const redact = (text: string) => redactWhole(text, ctx.deps.home, ctx.secrets());
        return record(
          {
            kind: dotted === 'vault' ? 'vault-change' : undefined,
            alsoVault: previousVault,
            summary: () => `Set config ${dotted}`,
            failure: `Could not set config ${dotted}`,
            // The value word is always `***`: a key under a mistyped path (`key.api`) fails, and
            // redactCommand's `keys` rule would miss it. outputs.value keeps a value that is set.
            argv: ctx.deps.argv.map((word) => (word === value ? REDACTED : word)),
            inputs: { path: dotted, ...(previousVault ? { vault: redact(previousVault) } : {}) },
            outputs: (r) => ({ value: dotted === 'vault' ? redact(String(r.value)) : r.value }),
            changed: (r) => r.changed,
          },
          () => setConfigValue(paths.config, dotted, value, ctx.deps, scriptGuard()),
        );
      },
    },
  };
}

/** The profile's setup and teardown now; none from a config that does not read, which a set may repair. */
function currentScripts(file: string): Pick<Config['worktrees'], 'setup' | 'teardown'> {
  try {
    const { setup, teardown } = loadConfig(file).worktrees;
    return { setup, teardown };
  } catch (error) {
    if (error instanceof MesaError && error.code === 'invalid_config')
      return { setup: [], teardown: [] };
    throw error;
  }
}
