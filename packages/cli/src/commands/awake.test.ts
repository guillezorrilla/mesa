import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('awake is off by default, sets each mode into sessions.keepAwake, and refuses another word', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('awake', '--json')).json.data).toEqual({
    mode: 'off',
    wanted: false,
    working: 0,
  });
  expect((await mesa('awake', 'working', '--json')).json.data).toEqual({
    mode: 'working',
    wanted: false,
    working: 0,
  });
  expect((await mesa('config', '--json')).json.data.sessions.keepAwake).toBe('working');
  expect((await mesa('awake', 'on')).stdout).toBe(
    'keep awake: on; keeping the Mac awake (0 working)\n',
  );
  const refused = await mesa('awake', 'always', '--json');
  expect(refused.code).toBe(2);
  expect(refused.json.error).toMatchObject({ code: 'usage' });
  expect((await mesa('config', '--json')).json.data.sessions.keepAwake).toBe('on');
  expect((await mesa('help', '--agent')).stdout).toContain('mesa awake');
});

test('a config file with another keepAwake value is a config error', async () => {
  await mesa('init', '--vault', 'vault');
  const set = await mesa('config', 'set', 'sessions.keepAwake', 'sometimes', '--json');
  expect(set.code).toBe(4);
  expect(set.json.error).toMatchObject({ code: 'invalid_config' });
});
