import type { MesaContext } from '../context.js';
import { redactPayload } from '../lib/redact.js';
import { resolveKey } from '../profile/config.js';
import { adapterBackend } from './adapter.js';
import { decide, type FaroProfile, selectBackend } from './decide.js';
import { rulesBackend } from './rules.js';
import type { Question } from './types.js';

/** Faro for one profile: the shared backends, the profile's view of them, and `mesa decide`. */
export function createFaro(ctx: MesaContext) {
  const { deps } = ctx;
  // ponytail: jev joins here when its backend lands (a paid API, used only with a key).
  /** Faro's shared backends, asked when a decision site's own rules are unsure. */
  const shared = [
    adapterBackend<unknown>({
      run: deps.run,
      redact: (value, maxString) => redactPayload(value, deps.home, ctx.secrets(), maxString),
    }),
  ];
  /** For questions no rules know (mesa decide), the rules answer evenly. */
  const outside = [rulesBackend<unknown>([]), ...shared];
  /** Faro's view of the profile; before init, rules only (nothing else is configured). */
  const profile = (): FaroProfile => {
    const config = ctx.configIfAny();
    return {
      decisions: config?.decisions ?? { backend: 'rules', threshold: 1 },
      hasKey: (name) => Boolean(config && resolveKey(config, name, deps.env)),
    };
  };
  return {
    shared,
    profile,
    /**
     * Faro, for questions from outside (mesa decide): no rules know them, so the rules backend
     * answers evenly. Decision sites bring their own rules backend.
     */
    decide: (state: unknown, questions: unknown) =>
      // decide validates what it is given: this is the boundary it checks.
      decide(
        { backends: outside, profile: profile(), clock: deps.clock },
        state,
        questions as Question[],
      ),
    /** The backend the profile names and the one in use, for doctor; none before init. */
    inUse: () => {
      if (!ctx.configIfAny()) return undefined;
      const now = profile();
      const named = now.decisions.backend;
      const active = selectBackend(outside, now).name;
      return { named, active, threshold: now.decisions.threshold };
    },
  };
}

export type Faro = ReturnType<typeof createFaro>;
