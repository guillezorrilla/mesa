import { fakeHttp } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const BROKER = 'https://broker.example.test';

test('feedback sends the message from the cli and thanks; --json prints sent', async () => {
  const web = fakeHttp({ [`POST ${BROKER}/feedback`]: { status: 201, body: {} } });
  cli.deps = { http: web.http, env: { MESA_BROKER_URL: BROKER } };
  const out = await cli.mesa('feedback', 'The board loses my place');
  expect(out.code).toBe(0);
  expect(out.stdout).toBe('Thanks, feedback sent.\n');
  expect(JSON.parse(web.requests[0]?.body ?? '')).toMatchObject({
    message: 'The board loses my place',
    from: 'cli',
  });
  const json = await cli.mesa('feedback', 'Again', '--from', 'sessions', '--json');
  expect(json.json.data).toEqual({ sent: true });
  expect(JSON.parse(web.requests[1]?.body ?? '')).toMatchObject({ from: 'sessions' });
});

test('feedback with an empty message is a usage error and sends nothing', async () => {
  const web = fakeHttp();
  cli.deps = { http: web.http, env: { MESA_BROKER_URL: BROKER } };
  expect((await cli.mesa('feedback', '  ')).code).toBe(2);
  expect((await cli.mesa('feedback')).code).toBe(2);
  expect(web.requests).toHaveLength(0);
});

test('feedback the broker refuses exits non-zero with what to do', async () => {
  cli.deps = { http: fakeHttp().http, env: { MESA_BROKER_URL: BROKER } };
  const out = await cli.mesa('feedback', 'hi');
  expect(out.code).toBe(1);
  expect(out.stderr).toContain('check your connection and try again');
});
