import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MesaError } from '../lib/result.js';
import { createMesa } from '../mesa.js';
import { reportPrompt } from '../reports/reports.js';
import {
  newSession,
  profilePaths,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';

const AT = '2026-11-10T12:00:00.000Z';

/** A profile with a coordinator session, and Mesa as a process in `window` sees it, or a person's. */
function profile() {
  const { run } = scriptedRunner();
  const { home } = projectProfile(run);
  const store = testStore(home);
  const lead = store.create(() => newSession());
  let n = 0;
  let now = AT;
  const mesa = (window?: string) =>
    createMesa(
      'default',
      testDeps(home, {
        run,
        clock: () => new Date(now),
        newId: () => `01TESTGATE${String(++n).padStart(16, '0')}`,
        env: window ? { MESA_SESSION_ID: window, MESA_PROFILE: 'default' } : {},
      }),
    );
  return {
    home,
    store,
    lead,
    mesa,
    later: (iso: string) => {
      now = iso;
    },
  };
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof MesaError) return { code: error.code, message: error.message };
    throw error;
  }
  return undefined;
};

test('a gate takes two to eight distinct options on a live task, by the Caller', () => {
  const { lead, mesa } = profile();
  const agent = mesa(lead.id);
  const task = agent.tasks.create('Parse the tide tables');
  const gate = agent.gates.create(task.id, '  Store tide heights in metres or feet?  ', [
    'metres',
    'feet',
  ]);
  expect(gate).toEqual({
    id: expect.stringMatching(/^g-[a-z0-9]{8}$/),
    task: task.id,
    question: 'Store tide heights in metres or feet?',
    options: ['metres', 'feet'],
    by: lead.id,
    at: AT,
  });
  expect(code(() => agent.gates.create(task.id, 'Which?', ['one']))?.code).toBe('usage');
  const nine = Array.from({ length: 9 }, (_, i) => `o${i}`);
  expect(code(() => agent.gates.create(task.id, 'Which?', nine))?.code).toBe('usage');
  expect(code(() => agent.gates.create(task.id, 'Which?', ['a', 'a']))?.code).toBe('usage');
  expect(code(() => agent.gates.create(task.id, ' ', ['a', 'b']))?.code).toBe('usage');
  expect(code(() => agent.gates.create('t-nope', 'Which?', ['a', 'b']))?.code).toBe('not_found');
  const dropped = agent.tasks.create('Draw the old chart');
  agent.tasks.cancel(dropped.id);
  expect(code(() => agent.gates.create(dropped.id, 'Which?', ['a', 'b']))).toEqual({
    code: 'usage',
    message: `task ${dropped.id} is cancelled; a gate needs a live task`,
  });
  expect(agent.gates.list().gates.map((g) => g.id)).toEqual([gate.id]);
  // A person outside a window opens one with no `by`.
  expect(mesa().gates.create(task.id, 'Which chart?', ['a', 'b']).by).toBeUndefined();
});

test('an open gate blocks its task until a person resolves it outside a Mesa window', async () => {
  const { home, lead, mesa } = profile();
  const agent = mesa(lead.id);
  const parse = agent.tasks.create('Parse the tide tables');
  const chart = agent.tasks.create('Draw the tide chart');
  const gate = agent.gates.create(parse.id, 'Metres or feet?', ['metres', 'feet']);

  expect(agent.tasks.show(parse.id)).toMatchObject({ state: 'blocked', gates: [gate] });
  expect(agent.tasks.list({ ready: true }).tasks.map((t) => t.id)).toEqual([chart.id]);
  await expect(agent.tasks.start(parse.id, 'lantern-cove')).rejects.toThrow(
    `task ${parse.id} is blocked, not ready: a person must resolve its gate first (mesa gates)`,
  );
  // The blocked state is how it reads, never what is written.
  const file = JSON.parse(readFileSync(profilePaths(home, 'default').tasks, 'utf8'));
  expect(file.tasks.find((t: { id: string }) => t.id === parse.id).state).toBe('ready');

  const before = readFileSync(profilePaths(home, 'default').tasks, 'utf8');
  expect(code(() => agent.gates.resolve(gate.id, 'metres'))).toEqual({
    code: 'usage',
    message: 'only a person resolves a gate: run it outside a Mesa window or use the app',
  });
  // Any Mesa window, even one of no session in this profile.
  expect(code(() => mesa('stranger').gates.resolve(gate.id, 'metres'))?.code).toBe('usage');
  expect(readFileSync(profilePaths(home, 'default').tasks, 'utf8')).toBe(before);

  const person = mesa();
  expect(code(() => person.gates.resolve(gate.id, 'yards'))).toEqual({
    code: 'usage',
    message: `gate ${gate.id} offers metres, feet, not yards`,
  });
  expect(code(() => person.gates.resolve('g-nope', 'metres'))?.code).toBe('not_found');
  const resolved = person.gates.resolve(gate.id, 'metres');
  expect(resolved).toMatchObject({ option: 'metres', resolvedAt: AT });
  expect(person.tasks.show(parse.id).state).toBe('ready');
  expect(person.gates.list().gates).toEqual([]);
  expect(code(() => person.gates.resolve(gate.id, 'feet'))).toEqual({
    code: 'usage',
    message: `gate ${gate.id} was resolved at ${AT}`,
  });
});

test("resolving reports the choice to the task's coordinator, and to none without one", () => {
  const { lead, mesa } = profile();
  const agent = mesa(lead.id);
  const task = agent.tasks.create('Parse the tide tables');
  const gate = agent.gates.create(task.id, 'Metres or feet?', ['metres', 'feet']);
  const person = mesa();
  const orphan = person.tasks.create('Tidy the harbour notes');
  const orphanGate = person.gates.create(orphan.id, 'Keep the old notes?', ['keep', 'drop']);

  person.gates.resolve(gate.id, 'metres');
  person.gates.resolve(orphanGate.id, 'drop');

  const { reports } = person.reports.list();
  expect(reports).toEqual([
    expect.objectContaining({
      parent: lead.id,
      kind: 'gate',
      gate: gate.id,
      task: task.id,
      message: 'Metres or feet?',
      option: 'metres',
    }),
  ]);
  const prompt = reportPrompt(reports);
  expect(prompt).toContain(`A person resolved gate ${gate.id} on task ${task.id}`);
  expect(prompt).toContain('chose: metres');
});

test('a gate report follows its coordinator to the session that resumed it', () => {
  const { lead, store, mesa } = profile();
  const agent = mesa(lead.id);
  const task = agent.tasks.create('Parse the tide tables');
  const gate = agent.gates.create(task.id, 'Metres or feet?', ['metres', 'feet']);
  const next = store.create(() => newSession({ resumedFrom: lead.id }));
  mesa().gates.resolve(gate.id, 'feet');
  expect(
    mesa()
      .reports.list()
      .reports.map((r) => r.parent),
  ).toEqual([next.id]);
});

test('an open gate raises an Inbox notice that resolving clears', () => {
  const { lead, mesa } = profile();
  const agent = mesa(lead.id);
  const task = agent.tasks.create('Parse the tide tables');
  const gate = agent.gates.create(task.id, 'Metres or feet?', ['metres', 'feet']);
  const person = mesa();
  const orphan = person.tasks.create('Tidy the harbour notes');
  person.gates.create(orphan.id, 'Keep the old notes?', ['keep', 'drop']);

  const gates = () => person.notifications.list().filter((item) => item.kind === 'gate');
  expect(gates()).toEqual([
    expect.objectContaining({ title: 'Keep the old notes?', target: { kind: 'inbox' } }),
    expect.objectContaining({
      title: 'Metres or feet?',
      session: lead.id,
      target: { kind: 'session', id: lead.id },
    }),
  ]);
  person.gates.resolve(gate.id, 'metres');
  expect(gates().map((item) => item.title)).toEqual(['Keep the old notes?']);
});

test('a running task with an open gate reads blocked and keeps its worker', () => {
  const { home, lead, store, mesa } = profile();
  const worker = store.create(() => newSession({ parent: lead.id }));
  writeFileSync(
    profilePaths(home, 'default').tasks,
    JSON.stringify({
      tasks: [
        {
          id: 't-run',
          spec: 'Parse the tide tables',
          graph: 'default',
          deps: [],
          state: 'running',
          coordinator: lead.id,
          createdAt: AT,
          startedAt: AT,
          worker: worker.id,
        },
      ],
    }),
  );
  const gate = mesa(worker.id).gates.create('t-run', 'Metres or feet?', ['metres', 'feet']);
  expect(gate.by).toBe(worker.id);
  expect(mesa().tasks.show('t-run')).toMatchObject({ state: 'blocked', worker: worker.id });
  mesa().gates.resolve(gate.id, 'metres');
  expect(mesa().tasks.show('t-run').state).toBe('running');
});
