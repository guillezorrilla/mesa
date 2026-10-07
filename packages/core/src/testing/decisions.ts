import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Decision, DecisionRecorder, DecisionsModel } from '../decisions/types.js';
import { createMesa } from '../mesa.js';
import type { NewSession } from '../sessions/record/record.js';
import { windowEnv } from '../sessions/window/caller.js';
import { projectProfile, testDeps } from './profile.js';
import { scriptedRunner } from './runner.js';
import { newSession, testStore } from './sessions.js';
import { systemOneWorld, TEST_CLOUDFLARE_ACCOUNT } from './systemone.js';

/** A DecisionRecorder that keeps every decision in `decisions`, for tests. */
export function memoryRecorder(): DecisionRecorder & { decisions: Decision[] } {
  const decisions: Decision[] = [];
  return { decisions, record: (d) => void decisions.push(d) };
}

/**
 * A live claude session on lantern-cove saved with `goal`, in a profile over systemOneWorld whose
 * Decision model is `model` (its invented key saved, so the world's requests start empty), with
 * `mesa` running inside the session's window and `person` outside any. `put` writes an invented
 * vault item, and `plant` another session record.
 */
export async function assistedSession({
  model = 'jev',
  goal = 'Make the tide table import retry when the feed answers 503',
}: {
  model?: DecisionsModel;
  goal?: string;
} = {}) {
  const world = systemOneWorld();
  const { home, mesa: person } = projectProfile(scriptedRunner().run, world.deps);
  if (model === 'jev') await person.decisions.keys.set('typesafe', 'ts-test-0000-1111-abcd');
  if (model === 'clef')
    await person.decisions.keys.set('cloudflare', 'cf-test-2222-3333-wxyz', {
      account: TEST_CLOUDFLARE_ACCOUNT,
    });
  world.requests.length = 0;
  const store = testStore(home);
  /** Another session record in the profile, as `newSession` makes it. */
  const plant = (overrides: Partial<NewSession> = {}) => store.create(() => newSession(overrides));
  const session = plant({ goal });
  const env = windowEnv(session.id, 'default');
  const mesa = createMesa('default', testDeps(home, { ...world.deps, env }));
  const vault = join(home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(vault, path)), { recursive: true });
    writeFileSync(join(vault, path), text);
  };
  return { world, home, vault, person, mesa, session, plant, put };
}
