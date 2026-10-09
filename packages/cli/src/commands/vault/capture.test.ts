import { claudeAnswer, finishesRun, plantTranscript, testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const NOTE = {
  kind: 'note',
  title: 'The tide feed answers 503 on the hour',
  body: 'It rebuilds its cache on the hour; retry after 15 s.',
};
const ASKED = '2026-10-08T09:00:00.000Z';
const TRANSCRIPT = JSON.stringify({
  type: 'user',
  timestamp: ASKED,
  message: { role: 'user', content: 'Why does the tide feed fail on the hour?' },
});
const LATER = JSON.stringify({
  type: 'user',
  timestamp: '2026-10-08T09:05:00.000Z',
  message: { role: 'user', content: 'Does it fail on the half hour too?' },
});

test('vault capture runs a capture of the session now and prints the notes it saved; show keeps them', async () => {
  cli.withTmux({ onOpen: finishesRun({ output: claudeAnswer(JSON.stringify([NOTE])) }) });
  const dir = await cli.withProject();
  const opened = await cli.mesa('open', 'lantern-cove', '--goal', 'Fix the feed', '--json');
  const { id, agentSessionId } = opened.json.data;
  plantTranscript(cli.home, agentSessionId, dir, TRANSCRIPT);

  const json = await cli.mesa('vault', 'capture', id, '--json');
  expect(json.code).toBe(0);
  const path = 'wiki/notes/the-tide-feed-answers-503-on-the-hour.md';
  expect(json.json.data).toEqual({
    session: id,
    run: expect.any(String),
    ok: true,
    notes: [path],
    receipt: { id: expect.any(String), path: expect.stringMatching(/^receipts\//) },
  });
  const shown = await cli.mesa('show', id, '--json');
  expect(shown.json.data.capture).toEqual({
    run: json.json.data.run,
    at: expect.any(String),
    state: 'done',
    notes: [path],
    receipt: json.json.data.receipt.path,
    through: ASKED,
  });
  // Nothing said since: nothing to capture.
  const none = await cli.mesa('vault', 'capture', id, '--json');
  expect(none.json).toMatchObject({ ok: false, error: { code: 'usage' } });
  plantTranscript(cli.home, agentSessionId, dir, `${TRANSCRIPT}\n${LATER}`);
  const text = await cli.mesa('vault', 'capture', id);
  expect(text.code).toBe(0);
  expect(text.stdout).toContain('nothing to save: run ');
});

test('vault capture exits 1 and says why when the capture fails, and refuses a terminal', async () => {
  cli.withTmux({ onOpen: finishesRun({ output: claudeAnswer('Saved it for you.') }) });
  const dir = await cli.withProject();
  const opened = await cli.mesa('open', 'lantern-cove', '--goal', 'Fix the feed', '--json');
  const { id, agentSessionId } = opened.json.data;
  plantTranscript(cli.home, agentSessionId, dir, TRANSCRIPT);
  const failed = await cli.mesa('vault', 'capture', id, '--json');
  expect(failed.code).toBe(1);
  expect(failed.json.data).toMatchObject({
    ok: false,
    notes: [],
    reason: 'the vault-capture run returned no JSON array',
  });
  expect(testStore(cli.home).get(id).capture).toMatchObject({ state: 'failed' });
  const terminal = await cli.mesa('open', 'lantern-cove', '--terminal', '--json');
  const refused = await cli.mesa('vault', 'capture', terminal.json.data.id, '--json');
  expect(refused.json).toMatchObject({ ok: false, error: { code: 'usage' } });
});
