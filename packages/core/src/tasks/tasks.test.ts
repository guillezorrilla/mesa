import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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

test('each create reads the file anew, so two mesa processes taking turns both keep theirs', () => {
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

test('a create waits on the lock another mesa holds, and writes nothing when it stays held', () => {
  const { home, service } = profile();
  const tasks = service();
  tasks.create('Parse');
  const file = profilePaths(home, 'default').tasks;
  const before = readFileSync(file, 'utf8');
  // Another live mesa (this test's own process) is mid-change.
  writeFileSync(`${file}.lock`, String(process.pid));
  expect(() => tasks.create('Chart')).toThrow(expect.objectContaining({ code: 'locked' }));
  expect(readFileSync(file, 'utf8')).toBe(before);
});

test('pending and ready are read from the deps, not the file: a settled dep unlocks its dependent', () => {
  const { home, service } = profile();
  const file = profilePaths(home, 'default').tasks;
  const task = (id: string, state: string, deps: string[] = []) => ({
    id,
    spec: id,
    graph: 'tides',
    deps,
    state,
    createdAt: AT,
  });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({
      tasks: [
        task('t-parse000', 'succeeded'),
        task('t-chart000', 'pending', ['t-parse000']),
        task('t-broken00', 'failed'),
        task('t-afterbad', 'ready', ['t-broken00']),
        task('t-printing', 'running', ['t-parse000']),
      ],
    }),
  );
  const tasks = service();
  expect(tasks.list().tasks.map((t) => `${t.id} ${t.state}`)).toEqual([
    't-parse000 succeeded',
    't-chart000 ready',
    't-broken00 failed',
    't-afterbad pending',
    't-printing running',
  ]);
  expect(tasks.list({ ready: true }).tasks.map((t) => t.id)).toEqual(['t-chart000']);
  expect(tasks.create('Label it', { deps: ['t-chart000'] }).state).toBe('pending');
  expect(tasks.create('Bind it', { deps: ['t-parse000'] }).state).toBe('ready');
});
