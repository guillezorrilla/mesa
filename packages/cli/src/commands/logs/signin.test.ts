import type { Runner } from '@mesa/core';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

/** gcloud scripted by `answer`, every call kept. */
function withGcloud(answer: (args: string[]) => Awaited<ReturnType<Runner>>) {
  const calls: { args: string[]; timeoutMs: number }[] = [];
  const base = cli.run;
  cli.run = async (file, args, timeoutMs, options) => {
    if (file !== 'gcloud') return base(file, args, timeoutMs, options);
    calls.push({ args, timeoutMs });
    return answer(args);
  };
  return calls;
}

const setUp = () =>
  mesa(
    'logs',
    'setup',
    '--project',
    'tide-tables-123',
    '--env',
    'beta=resource.labels.cluster_name="harbour-beta"',
    '--json',
  );

test('logs login runs gcloud auth login itself and waits for the browser; a failure or an unfinished sign-in says why', async () => {
  let said: Awaited<ReturnType<Runner>> = { ok: true, stdout: '' };
  const calls = withGcloud(() => said);
  const ok = await mesa('logs', 'login', '--json');
  expect(ok.json.data).toEqual({ signedIn: true });
  expect(calls.at(-1)).toEqual({ args: ['auth', 'login'], timeoutMs: 180_000 });
  said = {
    ok: false,
    reason: 'failed',
    detail: 'exit 1',
    output: 'ERROR: (gcloud.auth.login) There was a problem with web authentication.',
  };
  const failed = await mesa('logs', 'login', '--json');
  expect(failed.json.error).toMatchObject({
    message: 'gcloud auth login failed: There was a problem with web authentication.',
    details: { fix: 'gcloud auth login' },
  });
  said = { ok: false, reason: 'timeout', detail: 'killed' };
  expect((await mesa('logs', 'login', '--json')).json.error.message).toBe(
    'the sign-in was not finished in the browser within 3 minutes',
  );
  // An agent never signs the person in.
  cli.env = { MESA_SESSION_ID: 'agentwin' };
  const before = calls.length;
  expect((await mesa('logs', 'login', '--json')).code).toBe(2);
  expect(calls).toHaveLength(before);
});

test('logs enable turns on Error Reporting only in a configured project, and only for a person', async () => {
  await cli.withProject();
  const calls = withGcloud(() => ({ ok: true, stdout: '' }));
  await setUp();
  const done = await mesa('logs', 'enable', 'tide-tables-123', '--json');
  expect(done.json.data).toEqual({
    project: 'tide-tables-123',
    enabled: 'clouderrorreporting.googleapis.com',
  });
  expect(calls.at(-1)?.args).toEqual([
    'services',
    'enable',
    'clouderrorreporting.googleapis.com',
    '--project',
    'tide-tables-123',
  ]);
  expect((await mesa('logs', 'enable', 'elsewhere-9', '--json')).code).toBe(2);
  cli.env = { MESA_SESSION_ID: 'agentwin' };
  expect((await mesa('logs', 'enable', 'tide-tables-123', '--json')).code).toBe(2);
  expect(calls.filter((c) => c.args[0] === 'services')).toHaveLength(1);
});
