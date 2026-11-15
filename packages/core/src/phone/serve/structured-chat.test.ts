import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { profilePaths } from '../../profile/paths.js';
import {
  replaySpawner,
  servingPhone,
  shortTempDir,
  testStore,
  untilTrue,
} from '../../testing/index.js';

const AT = '2026-11-15T10:00:00.000Z';
const entry = (body: object) => JSON.stringify({ at: AT, ...body });
const delta = (text: string) =>
  entry({
    event: {
      type: 'stream_event',
      event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    },
  });

test("a Structured session's phone screen shows the app's chat items, a reply still streaming included", async () => {
  const at = await servingPhone();
  testStore(at.home).update(at.session.id, {
    agent: 'claude',
    view: 'structured',
    agentSessionId: 'c0ffee00-0000-4000-8000-0000000000ee',
  });
  // Its host's journal: a prompt, a finished reply, then a second prompt whose reply streams.
  const journals = profilePaths(at.home, 'default').journals;
  mkdirSync(journals, { recursive: true });
  writeFileSync(
    `${journals}/${at.session.id}.jsonl`,
    `${[
      entry({ sent: { type: 'user', text: 'Count the herons' } }),
      entry({
        event: { type: 'assistant', message: { content: [{ type: 'text', text: 'Three.' }] } },
      }),
      entry({ event: { type: 'result', subtype: 'success', num_turns: 1 } }),
      entry({ sent: { type: 'user', text: 'And the egrets?' } }),
      delta('Two egrets '),
      delta('so far'),
    ].join('\n')}\n`,
  );
  const detail = await at.calls.call({ method: 'session', id: at.session.id, replies: 10 });
  expect(detail.replies.map((r) => [r.from, r.segments.map((s) => s.text).join('')])).toEqual([
    ['agent', 'Two egrets so far'],
    ['you', 'And the egrets?'],
    ['agent', 'Three.'],
    ['you', 'Count the herons'],
  ]);
  // The journal is Mesa's, not lines for a person.
  expect(detail.tail).toEqual([]);
  // An older phone, which asks for no count, gets no prompts it would show as the agent's.
  const older = await at.calls.call({ method: 'session', id: at.session.id });
  expect(older.replies.map((r) => r.from)).toEqual(['agent', 'agent']);

  // Watched, the screen is pushed as the reply streams: the journal is the file followed.
  await at.calls.call({ method: 'watch', id: at.session.id, replies: 10 });
  appendFileSync(`${journals}/${at.session.id}.jsonl`, `${delta(', and a third')}\n`);
  const grown = () =>
    at.pushed.some(
      (m) =>
        m.kind === 'update' &&
        m.watched?.some((w) =>
          w.detail?.replies[0]?.segments.some((s) => s.text.includes('a third')),
        ),
    );
  expect(await untilTrue(grown)).toBe(true);
  await at.end();
});

test("a phone's reply to a Structured session goes to its host, nothing typed into the window", async () => {
  const fake = replaySpawner([], { stay: true });
  const at = await servingPhone(undefined, { home: shortTempDir(), spawn: fake.spawn });
  const { result } = await at.mesa.sessions.open('lantern-cove', { view: 'structured' });
  const host = await at.mesa.sessions.host(result.id, () => undefined);
  expect(await at.calls.call({ method: 'send', id: result.id, text: 'count the herons' })).toEqual({
    status: 'sent',
  });
  expect(fake.sent).toContainEqual({
    type: 'user',
    message: { role: 'user', content: 'count the herons' },
  });
  host.stop();
  await host.done;
  await at.end();
});
