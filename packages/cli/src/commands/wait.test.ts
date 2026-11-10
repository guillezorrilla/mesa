import { testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('wait returns at once for a session not working, and takes whole seconds for --timeout', async () => {
  await cli.withTwoProjects();
  const id = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const at = new Date().toISOString();
  testStore(cli.home).update(id, {
    lastState: { state: 'idle', confidence: 1, at, source: 'hook' },
  });

  const done = await cli.mesa('wait', id, '--json');
  expect(done.code).toBe(0);
  expect(done.json.data).toEqual({ sessions: [{ id, state: 'idle' }] });
  expect((await cli.mesa('wait', id)).stdout).toBe(`${id} idle\n`);
  expect((await cli.mesa('wait', id, '--timeout', 'soon', '--json')).code).toBe(2);
  expect((await cli.mesa('wait', 'nobody00', '--json')).json.error.code).toBe('not_found');
  expect((await cli.mesa('help', '--agent')).stdout).toContain('mesa wait');
});
