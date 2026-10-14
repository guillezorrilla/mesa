import { expect, test } from 'vitest';
import { newSession, plantTranscript, tempDir, testStore } from '../../testing/index.js';
import { GENERAL_PROJECT } from '../record/general.js';
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

test('a folder its agent moves to is where it works, back again when it leaves', () => {
  const { deps, store, record, plant } = setUp();
  const entered = {
    type: 'worktree-state',
    worktreeSession: { worktreePath: '/w/lantern-cove/tide-fix', originalCwd: '/src/lantern-cove' },
  };
  const left = { type: 'worktree-state', worktreeSession: null };
  plant(at('/src/lantern-cove', 'main'), entered);
  expect(refreshReadings(deps, record).cwd).toBe('/w/lantern-cove/tide-fix');
  // Its own folder, not a worktree it holds: removing it never offers to delete this one.
  expect(store.get(record.id).worktree).toBeUndefined();
  plant(entered, left);
  expect(refreshReadings(deps, store.get(record.id)).cwd).toBe('/src/lantern-cove');
});

test('a General session moving into a worktree keeps its readings', () => {
  const { deps, store, plant } = setUp();
  const general = store.create(() =>
    newSession({ agentSessionId: AGENT_ID, project: GENERAL_PROJECT, cwd: '/home/notes' }),
  );
  plant(at('/w/lantern-cove/tide-fix', 'tide-fix'), {
    type: 'worktree-state',
    worktreeSession: { worktreePath: '/w/lantern-cove/tide-fix', originalCwd: '/home/notes' },
  });
  const read = refreshReadings(deps, general);
  expect([read.cwd, read.gitBranch]).toEqual(['/w/lantern-cove/tide-fix', 'tide-fix']);
});
