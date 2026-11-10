import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const open = async () => {
  cli.withTmux();
  await cli.withProject();
  return (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
};

test('progress sets the Caller session line, and --clear removes it', async () => {
  const id = await open();
  cli.env = { MESA_SESSION_ID: id, MESA_PROFILE: 'default' };
  const set = await cli.mesa('progress', 'Running the tide-table tests', '--json');
  expect(set.json.data).toMatchObject({ id, progress: { text: 'Running the tide-table tests' } });
  expect((await cli.mesa('show', id, '--json')).json.data.progress.text).toBe(
    'Running the tide-table tests',
  );
  expect((await cli.mesa('sessions', '--json')).json.data[0].progress.text).toBe(
    'Running the tide-table tests',
  );
  await cli.mesa('progress', '--clear', '--json');
  expect((await cli.mesa('show', id, '--json')).json.data.progress).toBeUndefined();
});

test('progress --session names the session, cut to 120 characters', async () => {
  const id = await open();
  const set = await cli.mesa('progress', 'a'.repeat(300), '--session', id, '--json');
  expect(set.json.data.progress.text).toHaveLength(120);
});

test('progress outside a Mesa session without --session is a usage error', async () => {
  await open();
  const result = await cli.mesa('progress', 'Running the tide-table tests', '--json');
  expect(result.code).toBe(2);
  expect(result.json.error.message).toContain('--session');
});

test('progress needs either the text or --clear', async () => {
  expect((await cli.mesa('progress', '--session', await open(), '--json')).code).toBe(2);
});
