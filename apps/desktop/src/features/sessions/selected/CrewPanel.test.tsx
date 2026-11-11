// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { type CrewActions, CrewPanel } from './CrewPanel';

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
const state = (name: string, seconds: number) => ({
  state: name,
  confidence: 1,
  at: ago(seconds),
  source: 'hook',
});
const worker = (id: string, extra: object = {}) => ({
  ...managedRow(id, { parent: 'aaaaaaaa', parentNow: 'aaaaaaaa' }),
  branch: `session/${id}`,
  ...extra,
});
const task = (id: string, spec: string, extra: object = {}) => ({
  id,
  spec,
  graph: 'harbor',
  deps: [],
  state: 'ready',
  coordinator: 'aaaaaaaa',
  createdAt: '2026-09-25T12:00:00.000Z',
  ...extra,
});
const GATE = {
  id: 'g-metres00',
  task: 't-length00',
  question: 'Default berth length unit: metres or feet?',
  options: ['Metres', 'Feet'],
  at: '2026-09-25T12:00:00.000Z',
};

/** A coordinator with three tasks: one working, one done, one blocked on a gate and on the first. */
function harbor(answers: Parameters<typeof fakeBridge>[0] = {}) {
  return fakeBridge({
    sessions: () =>
      envelope([
        worker('bbbbbbbb', {
          lastState: state('working', 40),
          progress: { text: 'Editing src/berths.js', at: ago(5) },
          diff: { added: 1, removed: 0 },
        }),
        worker('cccccccc', {
          lastState: state('done', 120),
          endedAt: ago(120),
          report: { kind: 'done', at: ago(120), message: 'Added the test. All 3 tests pass.' },
          diff: { added: 4, removed: 0 },
        }),
        // A worker with no task, and the coordinator's own Setup session, which is no card.
        worker('dddddddd', { name: 'tide-notes', lastState: state('idle', 60) }),
        worker('eeeeeeee', { kind: 'terminal', agent: 'terminal', name: 'Setup' }),
      ]),
    tasks: () =>
      envelope({
        tasks: [
          task('t-docs0000', 'Document freeBerths\nin the README', {
            state: 'running',
            worker: 'bbbbbbbb',
          }),
          task('t-test0000', 'Test assign with no free berth', {
            state: 'succeeded',
            worker: 'cccccccc',
          }),
          task('t-length00', 'Change default berth length', {
            state: 'blocked',
            deps: ['t-docs0000'],
          }),
        ],
      }),
    gates: () => envelope({ gates: [GATE] }),
    reports: () => envelope({ enabled: true, reports: [], questions: [] }),
    ...answers,
  });
}

const ACTIONS: CrewActions = {
  send: () => {},
  stop: () => {},
  select: () => {},
  setupsOf: () => [],
};

async function crew(bridge: ReturnType<typeof fakeBridge>['bridge'], actions = ACTIONS) {
  await renderWithMesa(
    <CrewPanel
      sessionId="aaaaaaaa"
      project="lantern-cove"
      stamp=""
      actions={actions}
      onClose={() => {}}
    />,
    bridge,
  );
}
const all = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (id: string) => all(id).map((element) => element.textContent);

test('the header counts the crew by state over one bar segment per card', async () => {
  await crew(harbor().bridge);
  expect(text('crew-summary')).toEqual(['1 working, 1 idle, 1 done, 1 needs you']);
  expect(all('crew-bar')[0]?.children).toHaveLength(4);
  expect(
    [...(all('crew-bar')[0]?.children ?? [])].map((s) => s.getAttribute('data-phase')),
  ).toEqual(['working', 'done', 'needs-you', 'idle']);
});

test('the choice comes first, then one card per task in plan order with its worker folded in, titled by task, never by id', async () => {
  await crew(harbor().bridge);
  const choice = all('crew-choices')[0];
  const plan = all('session-crew')[0];
  // "Your choice" sits above the plan.
  expect(choice && plan && choice.compareDocumentPosition(plan)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(choice?.textContent).toContain(GATE.question);
  expect(choice?.textContent).toContain(
    'Task 3, Change default berth length, starts once you pick.',
  );
  expect([...(choice?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual([
    'Metres',
    'Feet',
  ]);
  const cards = all('crew-card');
  // Three tasks, then the worker with no task; the Setup session and each task's worker add none.
  expect(cards.map((card) => card.dataset.phase)).toEqual(['working', 'done', 'needs-you', 'idle']);
  expect(cards.map((card) => card.querySelector('[title^="Open"], span')?.textContent)).toEqual([
    'Document freeBerths',
    'Test assign with no free berth',
    'Change default berth length',
    'tide-notes',
  ]);
  expect(text('crew-card-state')).toEqual([
    'Working for 40s',
    'Done 2m ago',
    'Waits for your choice above',
    'Idle for 1m00s',
  ]);
  expect(cards[0]?.textContent).toContain('Now: Editing src/berths.js');
  expect(cards[0]?.textContent).toContain('+1 -0');
  expect(cards[1]?.textContent).toContain('Added the test. All 3 tests pass.');
  expect(text('crew-card-waits')).toEqual(['Also waits for Document freeBerths. No worker yet.']);
  expect(document.body.textContent).not.toMatch(/t-[a-z0-9]{8}|g-metres00/);
  // Branches and setup sit folded at the bottom.
  expect(all('crew-setups')[0]?.hasAttribute('open')).toBe(false);
  expect(all('crew-setups')[0]?.textContent).toContain('session/bbbbbbbb, no setup');
});

test("a card's title opens its worker, Message sends to it, and Stop asks first", async () => {
  const opened: string[] = [];
  const sent: string[] = [];
  const stopped: string[] = [];
  await crew(harbor().bridge, {
    ...ACTIONS,
    select: (id) => opened.push(id),
    send: (id, prompt) => sent.push(`${id} ${prompt}`),
    stop: (id) => stopped.push(id),
  });
  const [first] = all('crew-card');
  await click(first?.querySelector<HTMLElement>('[title="Open Document freeBerths"]') ?? undefined);
  expect(opened).toEqual(['bbbbbbbb']);
  const message = [...(first?.querySelectorAll('button') ?? [])].find(
    (b) => b.textContent === 'Message',
  );
  await click(message);
  const field = document.querySelector<HTMLTextAreaElement>(
    '[aria-label="Message for Document freeBerths"]',
  );
  if (!field) throw new Error('no composer');
  field.value = 'Also cover reserved berths';
  await click(
    document.querySelector<HTMLElement>('[aria-label="Send to Document freeBerths"]') ?? undefined,
  );
  expect(sent).toEqual(['bbbbbbbb Also cover reserved berths']);
  await click(
    first?.querySelector<HTMLElement>('[aria-label="Stop Document freeBerths"]') ?? undefined,
  );
  expect(stopped).toEqual([]);
  await click(
    document.querySelector<HTMLElement>('[data-testid="crew-stop-confirm"]') ?? undefined,
  );
  expect(stopped).toEqual(['bbbbbbbb']);
});

test('a gate option resolves it; Merge into parent says merged; a refused Start says why', async () => {
  const { bridge, calls } = harbor({
    'gates resolve': () => envelope({ ...GATE, option: 'Metres', resolvedAt: ago(0) }),
    merge: () =>
      envelope({
        merged: true,
        child: 'cccccccc',
        into: 'aaaaaaaa',
        branch: 'session/cccccccc',
        head: 'f00',
        checkout: '/w',
        receipt: null,
      }),
    tasks: () =>
      envelope({
        tasks: [
          task('t-ready000', 'Tag the moorings'),
          task('t-length00', 'Change default berth length', { state: 'blocked' }),
          task('t-test0000', 'Test it', { state: 'succeeded', worker: 'cccccccc' }),
        ],
      }),
    worker: () => ({ ok: false, error: { code: 'usage', message: 'nests workers 4 deep' } }),
  });
  await crew(bridge);
  await click(
    [...document.querySelectorAll<HTMLElement>('[data-testid="crew-gate"] button')].find(
      (b) => b.textContent === 'Metres',
    ),
  );
  expect(calls.find((argv) => argv[1] === 'gates' && argv[2] === 'resolve')).toEqual([
    '--json',
    'gates',
    'resolve',
    GATE.id,
    '--',
    'Metres',
  ]);
  await click(
    document.querySelector<HTMLElement>('[aria-label="Start Tag the moorings"]') ?? undefined,
  );
  expect(all('crew-card')[0]?.querySelector('[role="alert"]')?.textContent).toBe(
    'nests workers 4 deep',
  );
  await click(
    document.querySelector<HTMLElement>('[aria-label="Merge Test it into parent"]') ?? undefined,
  );
  expect(all('crew-card')[2]?.querySelector('[role="status"]')?.textContent).toBe(
    'Merged session/cccccccc into this session',
  );
  expect(all('crew-card')[2]?.querySelector('[data-testid="crew-card-state"]')?.textContent).toBe(
    'Done 2m ago, merged',
  );
});

test("a worker's open question waits in Your choice with a reply box, and its card says so", async () => {
  const question = {
    id: 'q-units000',
    parent: 'aaaaaaaa',
    child: 'dddddddd',
    childName: 'tide-notes',
    text: 'Metres or feet?',
    at: ago(30),
  };
  const { bridge, calls } = harbor({
    reports: (args) =>
      args[2] === 'reply'
        ? envelope({ question: { ...question, answer: 'metres' } })
        : envelope({ enabled: true, reports: [], questions: [question] }),
  });
  const failedSetup = managedRow('ffffffff', { setupFailed: true }) as TreeRow;
  const opened: string[] = [];
  await crew(bridge, {
    ...ACTIONS,
    select: (id) => opened.push(id),
    setupsOf: (id) => (id === 'dddddddd' ? [failedSetup] : []),
  });
  expect(all('crew-question')[0]?.textContent).toContain('Task 4, tide-notes, asks.');
  expect(text('crew-card-state')[3]).toBe('Asks you above');
  const answer = document.querySelector<HTMLInputElement>('[aria-label="Answer q-units000"]');
  if (!answer) throw new Error('no reply box');
  expect(answer).not.toBeNull();
  await click(
    [...(all('crew-setups')[0]?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'setup failed',
    ),
  );
  expect(opened).toEqual(['ffffffff']);
  expect(calls.some((argv) => argv[1] === 'reports' && argv[2] === 'reply')).toBe(false);
});
