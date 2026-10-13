import { expect, test } from 'vitest';
import { newSession, plantTranscript, tempDir, testStore } from '../../testing/index.js';
import { refreshReadings } from './readings.js';

const AGENT_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const at = (cwd: string, gitBranch?: string) => ({ type: 'user', cwd, gitBranch });

/** A Claude session in a temp home, its transcript `lines` once given. */
function setUp() {
  const home = tempDir();
  const store = testStore(home);
  const deps = { store, home, env: {} };
  const record = store.create(() => newSession({ agentSessionId: AGENT_ID }));
  const plant = (...lines: object[]) => plantTranscript(home, AGENT_ID, '/src/lantern-cove', lines);
  return { deps, store, record, plant };
}

test("a session's branch is the one its transcript last names, a worktree it entered too", () => {
  const { deps, store, record, plant } = setUp();
  // Not run yet: nothing to read.
  expect(refreshReadings(deps, record).gitBranch).toBeUndefined();
  plant(at('/src/lantern-cove', 'main'), at('/w/lantern-cove/tide-fix', 'tide-fix'));
  expect(refreshReadings(deps, record).gitBranch).toBe('tide-fix');
  expect(store.get(record.id).gitBranch).toBe('tide-fix');
  // A plain terminal names none.
  const shell = store.create(() => newSession({ kind: 'terminal', agent: 'terminal' }));
  expect(refreshReadings(deps, shell).gitBranch).toBeUndefined();
});

test('a transcript whose last line names no branch reads as none, kept as read', () => {
  const { deps, store, record, plant } = setUp();
  // Outside git, after a branch: its last line is what it works on now.
  plant(at('/src/lantern-cove', 'main'), at('/tmp/scratch'));
  expect(refreshReadings(deps, record).gitBranch).toBe('');
  expect(store.get(record.id).gitBranch).toBe('');
});
