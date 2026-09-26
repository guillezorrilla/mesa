import type { MesaContext } from '../context.js';
import { redactConfig, setConfigValue } from './config.js';
import { initProfile, type ProfileInfo } from './profile.js';

/** The profile itself: what it is, making it, and its config. */
export function profileService(ctx: MesaContext) {
  const { profile, paths, record } = ctx;
  return {
    info: (): ProfileInfo => ({ profile, dir: paths.root }),
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
      set: (dotted: string, value: string) => setConfigValue(paths.config, dotted, value),
    },
  };
}
