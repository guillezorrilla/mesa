import { expect, test } from 'vitest';
import { servingPhone, untilTrue } from '../../testing/index.js';
import { type PhoneDetail, WATCH_MS, type WatchedSession } from '../protocol/rpc.js';
import { sessionWatches } from './watches.js';

const detail = (title: string, terminal = false): PhoneDetail => ({
  row: {
    id: 'ab12cd34',
    title,
    project: null,
    state: 'working',
    since: 't1',
    context: null,
    unread: false,
    ...(terminal ? { terminal: true as const } : {}),
  },
  goal: null,
  replies: [],
  more: false,
  tail: [],
  queued: [],
  archived: false,
});

/** Watches over a session whose detail and output the test sets, on a clock it moves. */
const watching = (terminal = false) => {
  let now = 0;
  const session = { title: 'Docs', output: ['$ ls'] };
  const sent: WatchedSession[] = [];
  const watches = sessionWatches({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    read: async (id) => ({
      id,
      detail: detail(session.title, terminal),
      ...(terminal ? { output: session.output } : {}),
    }),
    send: (watched) => sent.push(watched),
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { watches, session, sent, settle, pass: (ms: number) => (now += ms) };
};

test('a watched session is pushed when its files change, only when it changed, until unwatched', async () => {
  const { watches, session, sent, settle } = watching();
  watches.changed('ab12cd34');
  await settle();
  expect(sent).toHaveLength(0);

  watches.answer({ method: 'watch', id: 'ab12cd34', replies: 10 });
  watches.changed('ab12cd34');
  await settle();
  expect(sent.map((s) => s.detail?.row.title)).toEqual(['Docs']);
  watches.changed();
  await settle();
  expect(sent).toHaveLength(1);
  session.title = 'Docs, round 2';
  watches.changed();
  await settle();
  expect(sent.map((s) => s.detail?.row.title)).toEqual(['Docs', 'Docs, round 2']);

  watches.answer({ method: 'unwatch', id: 'ab12cd34' });
  session.title = 'Docs, round 3';
  watches.changed('ab12cd34');
  await settle();
  expect(sent).toHaveLength(2);
  expect(watches.any()).toBe(false);
});

test('a watch not asked again within WATCH_MS lapses', async () => {
  const { watches, session, sent, settle, pass } = watching();
  watches.answer({ method: 'watch', id: 'ab12cd34' });
  pass(WATCH_MS - 1000);
  watches.answer({ method: 'watch', id: 'ab12cd34' });
  pass(WATCH_MS - 1000);
  watches.changed('ab12cd34');
  await settle();
  expect(sent).toHaveLength(1);

  pass(WATCH_MS + 1);
  session.title = 'Docs, round 2';
  watches.changed('ab12cd34');
  await settle();
  expect(sent).toHaveLength(1);
  expect(watches.any()).toBe(false);
});

test("an output log pushes a terminal's output, not an agent session; a burst is one push", async () => {
  const terminal = watching(true);
  terminal.watches.answer({ method: 'watch', id: 'ab12cd34' });
  terminal.watches.logged('ab12cd34');
  await terminal.settle();
  terminal.session.output = ['$ ls', 'README.md'];
  terminal.watches.logged('ab12cd34');
  terminal.watches.logged('ab12cd34');
  await terminal.settle();
  await terminal.settle();
  // The second push carries only what changed: the output, not the same detail again.
  expect(terminal.sent).toEqual([
    { id: 'ab12cd34', detail: detail('Docs', true), output: ['$ ls'] },
    { id: 'ab12cd34', output: ['$ ls', 'README.md'] },
  ]);

  const agent = watching();
  agent.watches.answer({ method: 'watch', id: 'ab12cd34' });
  agent.watches.changed('ab12cd34');
  await agent.settle();
  agent.session.title = 'Docs, round 2';
  agent.watches.logged('ab12cd34');
  await agent.settle();
  expect(agent.sent).toHaveLength(1);
});

test('the listener pushes a watched session to the phone when it changes, and stops at unwatch', async () => {
  const { mesa, session, calls, pushed, end } = await servingPhone();
  const watched = (title: string) =>
    pushed.some(
      (m) =>
        m.kind === 'update' &&
        m.watched?.some((w) => w.id === session.id && w.detail?.row.title === title),
    );
  await calls.call({ method: 'watch', id: session.id, replies: 10 });
  mesa.sessions.rename(session.id, 'Login fix, round 2');
  expect(await untilTrue(() => watched('Login fix, round 2'))).toBe(true);

  await calls.call({ method: 'unwatch', id: session.id });
  mesa.sessions.rename(session.id, 'Login fix, round 3');
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(watched('Login fix, round 3')).toBe(false);
  await end();
});
