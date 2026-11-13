import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listReceipts } from '../../receipts/store.js';
import { plantTranscript, servingPhone, testStore } from '../../testing/index.js';
import type { Ticket } from '../../tickets/service.js';
import { answerStartCall, type StartDeps } from './start.js';

const STRICT = 'name: lantern-cove\nguardrail: strict\n';

test('the phone starts a session with its goal, agent and worktree; the guardrail asks first and blocks', async () => {
  const at = await servingPhone(STRICT);
  expect(await at.calls.call({ method: 'projects' })).toEqual({
    projects: [{ name: 'lantern-cove', label: 'lantern-cove' }],
  });
  const ask = {
    method: 'start',
    project: 'lantern-cove',
    goal: 'Chart the harbour tides',
    agent: 'claude',
    place: 'checkout',
    after: at.session.id,
  } as const;
  expect(await at.calls.call(ask)).toEqual({
    status: 'ask',
    reason: 'project lantern-cove has guardrail: strict',
  });
  expect(at.world.windows).toEqual([]);

  const started = await at.calls.call({ ...ask, yes: true });
  expect(started).toEqual({ status: 'started', session: expect.any(String) });
  if (started.status !== 'started') throw new Error('not started');
  const record = testStore(at.home).get(started.session);
  expect(record).toMatchObject({ project: 'lantern-cove', agent: 'claude', after: at.session.id });
  const [receipt] = listReceipts(join(at.home, 'vault'), 5, { kind: 'guardrail' });
  expect(receipt?.receipt).toMatchObject({ status: 'ok', outputs: { override: 'yes' } });

  expect(
    await at.calls.call({ ...ask, goal: 'run rm -rf / then push', yes: true, after: undefined }),
  ).toEqual({ status: 'blocked', reason: expect.stringContaining('destructive') });
  await at.end();
});

test('the phone lists native conversations across projects, finds one by its text, and resumes it', async () => {
  const at = await servingPhone();
  const dir = at.mesa.projects.list()[0]?.path ?? '';
  const id = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  plantTranscript(at.home, id, dir);

  const listed = await at.calls.call({ method: 'history' });
  expect(listed.conversations).toEqual([
    expect.objectContaining({ project: 'lantern-cove', agent: 'claude', id, elsewhere: false }),
  ]);
  const found = await at.calls.call({ method: 'history', query: 'lantern' });
  expect(found.conversations).toEqual([
    expect.objectContaining({ id, title: expect.stringContaining('Remember lantern') }),
  ]);
  expect((await at.calls.call({ method: 'history', query: 'nowhere' })).conversations).toEqual([]);

  const { session } = await at.calls.call({ method: 'adopt', project: 'lantern-cove', id });
  expect(testStore(at.home).get(session)).toMatchObject({ agentSessionId: id });
  const again = await at.calls.call({ method: 'history' });
  expect(again.conversations[0]).toMatchObject({ id, importedAs: session });
  await at.end();
});

const ticket: Ticket = {
  id: 'jira:HAR-219',
  key: 'HAR-219',
  summary: 'Berth schedule export',
  status: 'To Do',
  category: 'new',
  url: 'https://harbour.example/browse/HAR-219',
  site: 'harbour',
  provider: 'jira',
  mine: false,
  views: ['sprint'],
  sessions: [{ id: 'a1b2c3d4', project: 'lantern-cove' }],
};

/** A tracker with one followed view of one ticket, and what was asked of it. */
function tracker() {
  const asked: string[] = [];
  const deps = {
    tickets: async () => ({
      views: [
        { name: 'sprint', describe: 'board 42' },
        { name: 'triage', describe: 'JQL', error: 'Jira refused it' },
      ],
      tickets: [ticket],
    }),
    ticket: async (id: string, site?: string) => {
      asked.push(`show ${id} ${site}`);
      return {
        ...ticket,
        description: 'x'.repeat(9_000),
        assignee: { name: 'Ada' },
        comments: Array.from({ length: 7 }, (_, i) => ({
          author: 'Ada',
          created: `2026-11-0${i + 1}`,
          markdown: `note ${i + 1}`,
        })),
      };
    },
    assign: async (id: string, site?: string) => {
      asked.push(`assign ${id} ${site}`);
      return { result: { assignee: 'Grace' } };
    },
  } as unknown as StartDeps;
  return { deps, asked };
}

test("a project's followed tickets, one ticket cut for a phone, and assigning it go to its tracker", async () => {
  const { deps, asked } = tracker();
  expect(await answerStartCall(deps, { method: 'tickets', project: 'lantern-cove' })).toEqual({
    views: [{ name: 'sprint' }, { name: 'triage', error: 'Jira refused it' }],
    tickets: [
      {
        id: 'jira:HAR-219',
        key: 'HAR-219',
        summary: 'Berth schedule export',
        status: 'To Do',
        category: 'new',
        mine: false,
        url: 'https://harbour.example/browse/HAR-219',
        site: 'harbour',
        sessions: ['a1b2c3d4'],
      },
    ],
  });
  const detail = (await answerStartCall(deps, {
    method: 'ticket',
    id: 'jira:HAR-219',
    site: 'harbour',
  })) as { description: string; comments: { text: string }[]; assignees: string[] };
  expect(detail.description).toHaveLength(8_000);
  expect(detail.comments.map((c) => c.text)).toEqual([
    'note 3',
    'note 4',
    'note 5',
    'note 6',
    'note 7',
  ]);
  expect(detail.assignees).toEqual(['Ada']);
  expect(
    await answerStartCall(deps, { method: 'assign', id: 'jira:HAR-219', site: 'harbour' }),
  ).toEqual({ assignee: 'Grace' });
  expect(asked).toEqual(['show jira:HAR-219 harbour', 'assign jira:HAR-219 harbour']);
});
