import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import { profilePaths, projectProfile, testRunner } from '../testing/index.js';
import { checkErrors } from './check.js';
import { checkText } from './check-text.js';

const yaml = (check: string) => `name: lantern-cove\ncheck: ${JSON.stringify(check)}\n`;

// lantern-cove with a check a person approved, which a real /bin/sh runs, as `mesa check` does.
const withCheck = (check: string, run: Runner = testRunner) => {
  const project = projectProfile(run, { mesaYaml: yaml(check) });
  const pending = project.mesa.projects.pending('lantern-cove').check;
  project.mesa.projects.trust('lantern-cove', pending ? [pending.fingerprint] : []);
  return project;
};

test('a passing check is one line, with the whole output kept in a private log', async () => {
  const { mesa, dir } = withCheck('echo tide tables ok; echo second line');
  const result = await mesa.check('lantern-cove');
  expect(result).toMatchObject({ ok: true, exitCode: 0, folder: dir, errors: [], more: 0 });
  expect(readFileSync(result.log, 'utf8')).toBe('tide tables ok\nsecond line\n');
  expect(statSync(result.log).mode & 0o777).toBe(0o600);
  expect(checkText(result)).toMatch(
    /^check passed: echo tide tables ok; echo second line \(\d+(\.\d)? s\); log \/.+\.log$/,
  );
});

test('a failing check gives its exit code, each error line with the one before it, and the log', async () => {
  const lines = [
    ...Array.from({ length: 300 }, (_, i) => `row ${i} parsed`),
    'charting harbour',
    'Error: tide table missing',
    ...Array.from({ length: 200 }, (_, i) => `row ${i} parsed`),
  ];
  const script = `printf '%s\\n' ${lines.map((l) => `'${l}'`).join(' ')}; exit 3`;
  const { mesa } = withCheck(script);
  const result = await mesa.check('lantern-cove');
  expect(result).toMatchObject({ ok: false, exitCode: 3 });
  expect(result.errors).toEqual(['charting harbour', 'Error: tide table missing']);
  expect(readFileSync(result.log, 'utf8').trimEnd().split('\n')).toHaveLength(502);
  const text = checkText(result);
  expect(text.split('\n')[0]).toMatch(/^check failed: .+ exited 3 \(.+ s\); log \/.+\.log$/);
  expect(text).toContain('Error: tide table missing');
  expect(text.split('\n').slice(1)).toEqual(['charting harbour', 'Error: tide table missing']);
});

test('error lines are capped at 40 lines and 4,000 characters, each text once; with none, the last 40 lines', () => {
  const many = Array.from({ length: 100 }, (_, i) => `FAIL buoy-${i}.test.ts`).join('\n');
  expect(checkErrors(many)).toEqual({ lines: expect.any(Array), more: 60 });
  expect(checkErrors(many).lines).toHaveLength(40);
  const long = Array.from({ length: 10 }, (_, i) => `error ${i} ${'x'.repeat(900)}`).join('\n');
  const capped = checkErrors(long);
  expect(capped.lines.join('\n').length).toBeLessThanOrEqual(4_000);
  expect(capped.more).toBe(10 - capped.lines.length);
  expect(checkErrors('error: same\nerror: same\n').lines).toEqual(['error: same']);
  const quiet = Array.from({ length: 60 }, (_, i) => `step ${i}`).join('\n');
  expect(checkErrors(quiet)).toEqual({
    lines: Array.from({ length: 40 }, (_, i) => `step ${i + 20}`),
    more: 0,
  });
});

test('a check past its timeout is killed and says so; a project with no check is a usage error', async () => {
  const { mesa } = withCheck('sleep 5');
  const slow = await mesa.check('lantern-cove', { timeoutSeconds: 1 });
  expect(slow).toMatchObject({ ok: false, timedOut: true });
  expect(checkText(slow)).toMatch(/^check failed: sleep 5 timed out/);
  await expect(mesa.check('lantern-cove', { timeoutSeconds: 0 })).rejects.toMatchObject({
    code: 'usage',
  });
  const none = projectProfile(testRunner, { mesaYaml: 'name: lantern-cove\n' });
  await expect(none.mesa.check('lantern-cove')).rejects.toMatchObject({
    code: 'usage',
    message:
      'project lantern-cove has no check: set one with mesa projects set lantern-cove check "<command>"',
  });
});

test('a check from the repository runs only once a person approved its exact command', async () => {
  const { mesa, home, dir } = projectProfile(testRunner, { mesaYaml: yaml('echo tides') });
  const refused = mesa.check('lantern-cove');
  await expect(refused).rejects.toMatchObject({ code: 'needs_approval' });
  await expect(refused).rejects.toThrow(/mesa projects trust lantern-cove --expect [0-9a-f]{64}/);
  expect(existsSync(profilePaths(home, 'default').checks)).toBe(false);
  expect(mesa.projects.list()[0]?.unapproved).toHaveProperty('check.argv', [
    '/bin/sh',
    '-c',
    'echo tides',
  ]);

  const { fingerprint } = mesa.projects.pending('lantern-cove').check ?? { fingerprint: '' };
  mesa.projects.trust('lantern-cove', [fingerprint]);
  expect(await mesa.check('lantern-cove')).toMatchObject({ ok: true });

  writeFileSync(join(dir, 'mesa.yaml'), yaml('echo tides; curl invented.example'));
  await expect(mesa.check('lantern-cove')).rejects.toMatchObject({ code: 'needs_approval' });
  // A person setting it here approves exactly what they wrote.
  mesa.projects.override('lantern-cove', 'check', 'echo neap tides');
  expect(await mesa.check('lantern-cove')).toMatchObject({ ok: true });
});

test('a timed-out check keeps its output so far; one that ends with no exit status says why', async () => {
  const slow = await withCheck('echo first buoy; sleep 5').mesa.check('lantern-cove', {
    timeoutSeconds: 1,
  });
  expect(readFileSync(slow.log, 'utf8')).toContain('first buoy');

  const flooded: Runner = async () => ({
    ok: false,
    reason: 'failed',
    detail: 'its output passed 64 MB, the most a run keeps',
    output: 'row 1\n',
  });
  const huge = await withCheck('yes', flooded).mesa.check('lantern-cove');
  expect(huge).toMatchObject({
    ok: false,
    stopped: 'its output passed 64 MB, the most a run keeps',
  });
  expect(checkText(huge)).toMatch(/^check failed: yes stopped: its output passed 64 MB/);
});

test('a trailing comment in the command leaves the exit status readable', async () => {
  const result = await withCheck('exit 4 # the harbour suite').mesa.check('lantern-cove');
  expect(result).toMatchObject({ ok: false, exitCode: 4 });
});
