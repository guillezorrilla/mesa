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

/**
 * A profile, and a tasks service as one mesa process sees it, in `window` when given: its workers
 * open as records in the store (or the start throws `refuse`), and report what `said` holds.
 */
function profile() {
  const { home } = projectProfile(scriptedRunner().run);
  const store = testStore(home);
  let n = 0;
  let now = AT;
  const said = new Map<string, { kind: string; message: string }>();
  const started: { project?: string; spec: string }[] = [];
  let refuse: Error | undefined;
  const service = (window?: string) =>
    tasksService(
      createContext(
        'default',
        testDeps(home, {
          clock: () => new Date(now),
          newId: () => `01TESTTASK${String(++n).padStart(16, '0')}`,
          env: window ? { MESA_SESSION_ID: window, MESA_PROFILE: 'default' } : {},
        }),
      ),
      {
        startWorker: async (project, spec) => {
          if (refuse) throw refuse;
          started.push({ ...(project ? { project } : {}), spec });
          return store.create(() => newSession({ goal: spec }));
        },
        reportOf: (worker) => said.get(worker),
      },
    );
  return {
    home,
    store,
    service,
    said,
    started,
    refuseWith: (error?: Error) => {
      refuse = error;
    },
    later: (iso: string) => {
      now = iso;
    },
  };
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

test('a ready task starts once with a worker; a pending one is refused, naming its state', async () => {
  const { store, service, started } = profile();
  const tasks = service();
  const parse = tasks.create('Parse the tide tables');
  const chart = tasks.create('Draw the chart', { deps: [parse.id] });
  await expect(tasks.start(chart.id, 'lantern-cove')).rejects.toThrow(
    new RegExp(`task ${chart.id} is pending, not ready`),
  );
  await expect(tasks.start('t-nope', 'lantern-cove')).rejects.toThrow(/no task t-nope/);
  const { task, worker } = await tasks.start(parse.id, 'lantern-cove');
  expect(started).toEqual([{ project: 'lantern-cove', spec: 'Parse the tide tables' }]);
  expect(task).toMatchObject({ state: 'running', worker: worker.id, startedAt: AT });
  expect(store.get(worker.id).task).toBe(parse.id);
  // Claimed: a second start finds it running.
  await expect(tasks.start(parse.id, 'lantern-cove')).rejects.toThrow(/is running, not ready/);
});

test("a worker's done report settles its task and readies the dependent; failed fails it with the reason", async () => {
  const { service, said } = profile();
  const tasks = service();
  const parse = tasks.create('Parse');
  const chart = tasks.create('Chart', { deps: [parse.id] });
  const label = tasks.create('Label', { deps: [chart.id] });
  const parsing = await tasks.start(parse.id, undefined);
  said.set(parsing.worker.id, { kind: 'blocked', message: 'Which tables?' });
  expect(tasks.show(parse.id).state).toBe('running');
  said.set(parsing.worker.id, { kind: 'done', message: 'Parsed 12 tables' });
  expect(tasks.show(parse.id).state).toBe('succeeded');
  expect(tasks.list({ ready: true }).tasks.map((t) => t.id)).toEqual([chart.id]);
  const charting = await tasks.start(chart.id, undefined);
  said.set(charting.worker.id, { kind: 'failed', message: 'The feed is down' });
  expect(tasks.show(chart.id)).toMatchObject({ state: 'failed', reason: 'The feed is down' });
  expect(tasks.show(label.id)).toMatchObject({ state: 'pending', heldBy: chart.id });
});

test('a running task whose worker ended without a report fails when tasks are next read', async () => {
  const { store, service } = profile();
  const tasks = service();
  const parse = tasks.create('Parse');
  const { worker } = await tasks.start(parse.id, undefined);
  store.update(worker.id, { endedAt: AT });
  expect(tasks.show(parse.id)).toMatchObject({ state: 'failed', reason: 'ended without a report' });
});

test('three failed starts in a row fail the task; a start that opens resets the count', async () => {
  const { service, refuseWith } = profile();
  const tasks = service();
  const parse = tasks.create('Parse');
  refuseWith(new Error('no such project'));
  await expect(tasks.start(parse.id, 'nowhere')).rejects.toThrow('no such project');
  expect(tasks.show(parse.id)).toMatchObject({ state: 'ready', startFailures: 1 });
  refuseWith(undefined);
  const { task } = await tasks.start(parse.id, undefined);
  expect(task).not.toHaveProperty('startFailures');
  const other = tasks.create('Chart');
  refuseWith(new Error('window would not open'));
  for (let i = 0; i < 3; i++) await expect(tasks.start(other.id, undefined)).rejects.toThrow();
  expect(tasks.show(other.id)).toMatchObject({
    state: 'failed',
    reason: 'start failed 3 times: window would not open',
  });
});

test('a claim whose worker never opened counts as a failed start after the grace', () => {
  const { home, service, later } = profile();
  const file = profilePaths(home, 'default').tasks;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({
      tasks: [
        {
          id: 't-claimed0',
          spec: 'x',
          graph: 'default',
          deps: [],
          state: 'running',
          createdAt: AT,
          startedAt: AT,
        },
      ],
    }),
  );
  expect(service().show('t-claimed0').state).toBe('running');
  later('2026-11-10T12:11:00.000Z');
  expect(service().show('t-claimed0')).toMatchObject({ state: 'ready', startFailures: 1 });
});

test('retry returns a failed or cancelled task to waiting; cancel takes a waiting one; neither a running one', async () => {
  const { service, said } = profile();
  const tasks = service();
  const parse = tasks.create('Parse');
  const chart = tasks.create('Chart', { deps: [parse.id] });
  expect(tasks.cancel(chart.id).state).toBe('cancelled');
  expect(tasks.retry(chart.id).state).toBe('pending');
  const { worker } = await tasks.start(parse.id, undefined);
  expect(() => tasks.cancel(parse.id)).toThrow(`stop its worker first: mesa stop ${worker.id}`);
  expect(() => tasks.retry(parse.id)).toThrow(/is running/);
  said.set(worker.id, { kind: 'failed', message: 'Feed down' });
  const again = tasks.retry(parse.id);
  expect(again.state).toBe('ready');
  for (const gone of ['worker', 'reason', 'startFailures', 'startedAt'])
    expect(again).not.toHaveProperty(gone);
  expect(() => tasks.retry(chart.id)).toThrow(/retry takes a failed or cancelled task/);
});
