import { expect, test } from 'vitest';
import { newSession, plantTranscript, tempDir, testStore } from '../../testing/index.js';
import { refreshBranch } from './branch.js';

const AGENT_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const at = (cwd: string, gitBranch: string) => ({ type: 'user', cwd, gitBranch });

test("a session's branch is the one its transcript last names, a worktree it entered too", () => {
  const home = tempDir();
  const store = testStore(home);
  const deps = { store, home, env: {} };
  const record = store.create(() => newSession({ agentSessionId: AGENT_ID }));
  // Not run yet: nothing to read.
  expect(refreshBranch(deps, record).gitBranch).toBeUndefined();
  const lines = [at('/src/lantern-cove', 'main'), at('/w/lantern-cove/tide-fix', 'tide-fix')];
  plantTranscript(
    home,
    AGENT_ID,
    '/src/lantern-cove',
    lines.map((l) => JSON.stringify(l)).join('\n'),
  );
  expect(refreshBranch(deps, record).gitBranch).toBe('tide-fix');
  expect(store.get(record.id).gitBranch).toBe('tide-fix');
  // A plain terminal names none.
  const shell = store.create(() => newSession({ kind: 'terminal', agent: 'terminal' }));
  expect(refreshBranch(deps, shell).gitBranch).toBeUndefined();
});
