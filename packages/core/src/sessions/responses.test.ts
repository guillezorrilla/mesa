import { expect, test } from 'vitest';
import {
  CLAUDE_VERSION,
  fakeTmux,
  plantTranscript,
  projectProfile,
  scriptedRunner,
} from '../testing/index.js';

test('response review pins an exact native message and passage before delivery', async () => {
  const world = fakeTmux();
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, dir, mesa } = projectProfile(run);
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  const nativeId = opened.agentSessionId ?? '';
  const response = (text: string) =>
    JSON.stringify({
      type: 'assistant',
      uuid: 'invented-message',
      timestamp: '2026-09-28T12:00:00.000Z',
      cwd: dir,
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    });
  plantTranscript(
    home,
    nativeId,
    dir,
    [
      JSON.stringify({
        type: 'assistant',
        isSidechain: true,
        message: { role: 'assistant', content: 'Do not show' },
      }),
      response('The violet otter is here.'),
    ].join('\n'),
  );

  const listed = mesa.sessions.responses.list(opened.id);
  expect(listed.rows).toHaveLength(1);
  const row = listed.rows[0];
  if (!row) throw new Error('response missing');
  expect(row).toMatchObject({
    profile: 'default',
    session: opened.id,
    agent: 'claude',
    text: 'The violet otter is here.',
  });
  const input = {
    profile: row.profile,
    source: row.source,
    revision: row.revision,
    start: 4,
    end: 16,
    comment: 'Please verify this.',
  };
  const preview = mesa.sessions.responses.preview(opened.id, input);
  expect(preview).toMatchObject({
    target: opened.id,
    passage: 'violet otter',
    comment: input.comment,
  });
  expect(preview.prompt).toContain('Quoted passage: "violet otter"');
  const delivered = await mesa.sessions.responses.send(opened.id, input, { noFrom: true });
  expect(delivered).toMatchObject({ id: preview.id, status: 'delivered', sent: { sent: true } });
  expect(mesa.sessions.responses.list(opened.id).reviews).toMatchObject([
    { id: preview.id, status: 'delivered', comment: input.comment },
  ]);
  expect(await mesa.sessions.responses.send(opened.id, input, { noFrom: true })).toMatchObject({
    status: 'delivered',
    already: true,
  });
  expect(world.windows[0]?.typed).toEqual([preview.prompt]);

  expect(() => mesa.sessions.responses.preview(opened.id, { ...input, profile: 'other' })).toThrow(
    'another Mesa profile',
  );
  plantTranscript(home, nativeId, dir, response('The violet otter changed.'));
  expect(() => mesa.sessions.responses.preview(opened.id, input)).toThrow(
    'changed or left the recent transcript',
  );
  expect(world.windows[0]?.typed).toHaveLength(1);
});

test('an unconfirmed review send stays saved and cannot be retried blindly', async () => {
  const world = fakeTmux({ failing: 'send-keys' });
  const run = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION }).run;
  const { home, dir, mesa } = projectProfile(run);
  const opened = (await mesa.sessions.open('lantern-cove')).result;
  plantTranscript(
    home,
    opened.agentSessionId ?? '',
    dir,
    JSON.stringify({
      type: 'assistant',
      cwd: dir,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Check this' }] },
    }),
  );
  const row = mesa.sessions.responses.list(opened.id).rows[0];
  if (!row) throw new Error('response missing');
  const input = {
    profile: row.profile,
    source: row.source,
    revision: row.revision,
    start: 0,
    end: 5,
    comment: 'Please check again',
  };
  expect(await mesa.sessions.responses.send(opened.id, input, { noFrom: true })).toMatchObject({
    status: 'uncertain',
  });
  expect(await mesa.sessions.responses.send(opened.id, input, { noFrom: true })).toMatchObject({
    status: 'uncertain',
  });
  expect(mesa.sessions.responses.list(opened.id).reviews).toMatchObject([
    { status: 'uncertain', comment: input.comment },
  ]);
  expect(world.windows[0]?.typed).toEqual([]);
});
