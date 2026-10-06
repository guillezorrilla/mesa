import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import type { Decision } from '../decisions/types.js';
import type { Runner } from '../lib/process.js';
import { listReceipts } from '../receipts/store.js';
import type { ManagedRow } from '../sessions/board/rows.js';
import type { Sent } from '../sessions/input/send.js';
import {
  type FakePullRequest,
  fakeGh,
  multiProjectSession,
  projectProfile,
  testDeps,
  testStore,
} from '../testing/index.js';
import { prEventsService } from './pr-event-delivery.js';

const at = '2026-09-24T12:00:00.000Z';
const reviewed: FakePullRequest = {
  number: 7,
  branch: 'feature',
  checks: [],
  reviews: [
    {
      id: 'R7',
      author: { login: 'marlow' },
      authorAssociation: 'COLLABORATOR',
      state: 'APPROVED',
      body: 'Looks right.',
      submittedAt: '2026-09-24T12:10:00Z',
    },
  ],
  comments: [],
  reviewComments: [],
};

/** Faro's placement of the row: idle, sure enough to type into. */
const idle: Decision = {
  questions: [{ kind: 'Choice', id: 'state', options: ['idle', 'working'] }],
  answers: [
    {
      kind: 'Choice',
      id: 'state',
      answer: 'idle',
      probabilities: { idle: 0.95, working: 0.05 },
      confidence: 0.95,
    },
  ],
  backend: 'rules',
  at,
  latencyMs: 1,
};

/**
 * A live session on lantern-cove with tide-pool as an additional project, whose tide-pool
 * worktree's repository has a reviewed PR on the session's branch; lantern-cove's has none.
 */
function multiProject() {
  const empty = fakeGh([]);
  const tide = fakeGh([reviewed]);
  const listedIn: (string | undefined)[] = [];
  const run: Runner = async (_file, args, _ms, options) => {
    if (args[0] === 'pr' && args[1] === 'list') listedIn.push(options?.cwd);
    const said = (options?.cwd === '/w/tide-pool/feature' ? tide : empty).answer(args);
    return typeof said === 'string' ? { ok: true, stdout: said } : said;
  };
  const { home, mesa } = projectProfile(run);
  const record = testStore(home).create(() => multiProjectSession());
  const row = {
    ...record,
    managed: true,
    alive: true,
    runningSeconds: 60,
    children: [],
    lastState: { state: 'idle', confidence: 0.95, at, source: 'faro' },
    decision: idle,
  } as unknown as ManagedRow;
  const typed: { id: string; prompt: string }[] = [];
  const service = prEventsService(createContext('default', testDeps(home, { run })), {
    board: async () => [row],
    send: async (id, prompt) => {
      typed.push({ id, prompt });
      const sent: Sent = { sent: true, session: id, project: 'lantern-cove', from: null, chars: 1 };
      return { result: sent, receipt: null };
    },
  });
  return { home, mesa, record, service, listedIn, typed };
}

test('PR events watch each worktree a session holds, each in its own project, branch, and folder', async () => {
  const { record, service, listedIn } = multiProject();
  const listed = await service.list();
  expect(listedIn).toEqual(['/w/lantern-cove/feature', '/w/tide-pool/feature']);
  expect(listed.events).toMatchObject([
    { session: record.id, project: 'tide-pool', kind: 'review', pr: { number: 7 } },
  ]);
});

test("a PR in an additional project's repository is forwarded into the session, its receipt on the primary", async () => {
  const { home, mesa, record, service, typed } = multiProject();
  mesa.config.set('sessions.prEvents', 'true');
  const delivered = await service.deliver();
  expect(delivered.deliveries).toMatchObject([{ session: record.id, status: 'delivered' }]);
  expect(typed).toHaveLength(1);
  expect(typed[0]?.prompt).toContain('PR #7 (https://github.com/example/repo/pull/7)');
  const [kept] = listReceipts(join(home, 'vault'), 10, { session: record.id });
  expect(kept?.receipt).toMatchObject({ kind: 'decision', project: 'lantern-cove' });
});
