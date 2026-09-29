import type { MesaContext } from '../context.js';
import { REDACTED } from '../lib/redact.js';
import { backupService } from './backup.js';
import { redactConfig, setConfigValue } from './config.js';
import { initProfile, type ProfileInfo } from './profile.js';

/** The profile itself: what it is, making it, and its config. */
export function profileService(ctx: MesaContext) {
  const { profile, paths, record } = ctx;
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
          outputs: (r) => ({ config: r.path }),
          changed: (r) => r.created,
        },
        () => initProfile(paths, { ...input, vault }),
      );
    },
    config: {
      /** Redacted: key values are `***`. */
      get: () => redactConfig(ctx.open().config),
      set: (dotted: string, value: string) =>
        record(
          {
            summary: () => `Set config ${dotted}`,
            failure: `Could not set config ${dotted}`,
            // The value word is always `***`: a key under a mistyped path (`key.api`) fails, and
            // redactCommand's `keys` rule would miss it. outputs.value keeps a value that is set.
            argv: ctx.deps.argv.map((word) => (word === value ? REDACTED : word)),
            inputs: { path: dotted },
            outputs: (r) => ({ value: r.value }),
            changed: (r) => r.changed,
          },
          () => setConfigValue(paths.config, dotted, value),
        ),
    },
  };
}
