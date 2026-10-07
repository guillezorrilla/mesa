import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Decision, DecisionRecorder, DecisionsModel } from '../decisions/types.js';
import { createMesa } from '../mesa.js';
import type { NewSession } from '../sessions/record/record.js';
import { windowEnv } from '../sessions/window/caller.js';
import { projectProfile, testDeps } from './profile.js';
import { scriptedRunner } from './runner.js';
import { newSession, testStore } from './sessions.js';
import { systemOneWorld, TEST_CLOUDFLARE_ACCOUNT, TEST_TYPESAFE_KEY } from './systemone.js';

/** A next-step decision request with two invented candidates. */
export const NEXT_STEP_REQUEST = {
  site: 'next-step',
  candidates: [
    { id: 'add-retry', step: 'Wrap the feed call in the retry helper' },
    { id: 'rerun', step: 'Rerun the suite' },
  ],
};

/** A decision answer without what differs between two calls of the same request. */
export const normalAnswer = ({
  evaluation: { cached: _, latencyMs: __, ...evaluation },
  ...rest
}: {
  evaluation: Record<string, unknown>;
}) => ({ ...rest, evaluation });

/** A DecisionRecorder that keeps every decision in `decisions`, for tests. */
export function memoryRecorder(): DecisionRecorder & { decisions: Decision[] } {
  const decisions: Decision[] = [];
  return { decisions, record: (d) => void decisions.push(d) };
}

/**
 * A live claude session on lantern-cove saved with `goal` (and `session`'s fields), in a profile
 * over systemOneWorld whose Decision model is `model` (its invented key saved, so the world's
 * requests start empty), with `mesa` running inside the session's window and `person` outside
 * any. `put` writes an invented vault item, and `plant` another session record.
 */
export async function assistedSession({
  model = 'jev',
  goal = 'Make the tide table import retry when the feed answers 503',
  session: fields = {},
}: {
  model?: DecisionsModel;
  goal?: string;
  session?: Partial<NewSession>;
} = {}) {
  const world = systemOneWorld();
  const { home, mesa: person } = projectProfile(scriptedRunner().run, world.deps);
  if (model === 'jev') await person.decisions.keys.set('typesafe', TEST_TYPESAFE_KEY);
  if (model === 'clef')
    await person.decisions.keys.set('cloudflare', 'cf-test-2222-3333-wxyz', {
      account: TEST_CLOUDFLARE_ACCOUNT,
    });
  world.requests.length = 0;
  const store = testStore(home);
  /** Another session record in the profile, as `newSession` makes it. */
  const plant = (overrides: Partial<NewSession> = {}) => store.create(() => newSession(overrides));
  const session = plant({ goal, ...fields });
  const env = windowEnv(session.id, 'default');
  const mesa = createMesa('default', testDeps(home, { ...world.deps, env }));
  const vault = join(home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(vault, path)), { recursive: true });
    writeFileSync(join(vault, path), text);
  };
  return { world, home, vault, person, mesa, session, plant, put };
}

/** The invented marker a delivery test finds in its agent's advice, and only there. */
export const ADVICE_MARKER = 'AMBER TIDE 7';
/** The note that holds it, the one source of lantern-cove's vault. */
export const MARKED_NOTE = 'wiki/decisions/retry-policy.md';

/**
 * An assistedSession of `agent` holding native conversation `agentSessionId`, launched with
 * mesa-decisions mounted, whose project's vault holds one invented decision with ADVICE_MARKER.
 */
export async function assistedAgent(
  agent: NewSession['agent'],
  agentSessionId: string,
  options: Parameters<typeof assistedSession>[0] = {},
) {
  const world = await assistedSession({
    ...options,
    session: {
      agent,
      agentSessionId,
      vaultMounted: true,
      decisionsMounted: true,
      ...options.session,
    },
  });
  world.put(
    MARKED_NOTE,
    `---\nproject: lantern-cove\ntype: decision\n---\n# Retry policy\n\nFeed calls retry 5 times on 503 (${ADVICE_MARKER}).\n`,
  );
  return world;
}
