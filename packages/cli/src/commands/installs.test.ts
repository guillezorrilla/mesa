import { fakeHttp, fakeRelease } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const BROKER = 'https://broker.example.test';
const ID = '00000000-0000-4000-8000-000000000001';

test('installs prints the switch; off erases a known install on the broker, on turns it back', async () => {
  const web = fakeHttp({ [`DELETE ${BROKER}/installs/${ID}`]: { status: 200, body: {} } });
  cli.deps = { http: web.http, env: { MESA_BROKER_URL: BROKER }, release: fakeRelease() };
  expect((await cli.mesa('installs', '--json')).json.data).toEqual({
    id: null,
    enabled: true,
    lastSentAt: null,
  });
  // An ID made by this very switch was never sent, so there is nothing to erase.
  expect((await cli.mesa('installs', 'off')).stdout).toBe('The anonymous install count is off.\n');
  expect(web.requests).toEqual([]);
  expect((await cli.mesa('installs', 'on', '--json')).json.data).toEqual({
    id: ID,
    enabled: true,
    lastSentAt: null,
  });
  expect((await cli.mesa('installs', 'off')).stdout).toBe(
    'The anonymous install count is off, and the broker erased this install.\n',
  );
  expect(web.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
    `DELETE ${BROKER}/installs/${ID}`,
  ]);
  expect((await cli.mesa('installs')).stdout).toBe('The anonymous install count is off.\n');
});

test('off says when the erase did not reach the broker; another state is a usage error', async () => {
  cli.deps = { http: fakeHttp().http, env: { MESA_BROKER_URL: BROKER }, release: fakeRelease() };
  await cli.mesa('installs', 'on');
  expect((await cli.mesa('installs', 'off')).stdout).toContain("The erase didn't reach the broker");
  expect((await cli.mesa('installs', 'maybe')).code).toBe(2);
});
