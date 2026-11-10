import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import {
  profilePaths,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';
import { newSession } from '../testing/sessions.js';
import { tasksService } from './tasks.js';

const AT = '2026-11-10T12:00:00.000Z';

/** A profile, and a tasks service as one mesa process sees it, in `window` when given. */
function profile() {
  const { home } = projectProfile(scriptedRunner().run);
  let n = 0;
  const service = (window?: string) =>
    tasksService(
      createContext(
        'default',
        testDeps(home, {
          clock: () => new Date(AT),
          newId: () => `01TESTTASK${String(++n).padStart(16, '0')}`,
          env: window ? { MESA_SESSION_ID: window, MESA_PROFILE: 'default' } : {},
        }),
      ),
    );
  return { home, service };
}

test('a task with no deps is ready, one waiting on an unfinished task is pending; the plan is kept on disk', () => {
  const { home, service } = profile();
  const tasks = service();
  const parse = tasks.create('Parse the tide tables', { graph: 'tides' });
  expect(parse).toEqual({
    id: expect.stringMatching(/^t-[0-9a-z]{8}$/),
    spec: 'Parse the tide tables',
    graph: 'tides',
    deps: [],
    state: 'ready',
    createdAt: AT,
  });
  const chart = tasks.create('Draw the tide chart', { graph: 'tides', deps: [parse.id] });
  expect(chart).toMatchObject({ state: 'pending', deps: [parse.id] });
  expect(tasks.create('Tidy the notes')).toMatchObject({ graph: 'default', state: 'ready' });
  expect(JSON.parse(readFileSync(profilePaths(home, 'default').tasks, 'utf8')).tasks).toHaveLength(
    3,
  );
  expect(tasks.show(chart.id).dependencies).toEqual([
    { id: parse.id, spec: 'Parse the tide tables', state: 'ready' },
  ]);
  expect(() => tasks.show('t-nope')).toThrow(/no task t-nope/);
});

test('an unknown dep, or one not created yet, is refused and writes nothing', () => {
  const { service } = profile();
  const tasks = service();
  const first = tasks.create('Parse the tide tables');
  // The next id this profile would draw: a task may only wait on one that exists.
  expect(() => tasks.create('Draw the chart', { deps: ['t-00000002'] })).toThrow(
    expect.objectContaining({ code: 'not_found' }),
  );
  expect(() => tasks.create('Draw the chart', { deps: [first.id, 't-nope'] })).toThrow(
    /no task t-nope/,
  );
  expect(tasks.list().tasks.map((t) => t.id)).toEqual([first.id]);
  expect(() => tasks.create('  ')).toThrow(/say what the task is/);
  expect(() => tasks.create('x', { graph: 'no spaces' })).toThrow(/graph no spaces/);
});

test('--ready lists only ready tasks, and a graph only its own, oldest first', () => {
  const { service } = profile();
  const tasks = service();
  const a = tasks.create('Parse', { graph: 'tides' });
  const b = tasks.create('Chart', { graph: 'tides', deps: [a.id] });
  const c = tasks.create('Notes', { graph: 'other' });
  expect(tasks.list().tasks.map((t) => t.id)).toEqual([a.id, b.id, c.id]);
  expect(tasks.list({ graph: 'tides' }).tasks.map((t) => t.id)).toEqual([a.id, b.id]);
  expect(tasks.list({ graph: 'tides', ready: true }).tasks.map((t) => t.id)).toEqual([a.id]);
});

test('two mesa processes creating tasks both keep theirs', () => {
  const { service } = profile();
  const one = service();
  const two = service();
  const a = one.create('Parse');
  const b = two.create('Chart', { deps: [a.id] });
  const c = one.create('Notes');
  expect(two.list().tasks.map((t) => t.id)).toEqual([a.id, b.id, c.id]);
});

test("a task's coordinator is the caller's session, or one named; an unknown one is not_found", () => {
  const { home, service } = profile();
  const store = testStore(home);
  const lead = store.create(() => newSession());
  expect(service(lead.id).create('Parse').coordinator).toBe(lead.id);
  expect(service().create('Parse', { coordinator: lead.id }).coordinator).toBe(lead.id);
  expect(service().create('Parse')).not.toHaveProperty('coordinator');
  expect(() => service().create('Parse', { coordinator: 'nobody00' })).toThrow(
    /no session nobody00/,
  );
});
