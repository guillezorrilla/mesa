import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { testRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// lantern-cove's check run by a real /bin/sh, as an agent runs mesa check.

const cli = cliHarness();
beforeEach(cli.reset);

test('check prints one line on a pass and the errors with the log on a failure, exiting 1', async () => {
  cli.run = testRunner;
  const dir = await cli.withProject();
  const set = await cli.mesa('projects', 'set', 'lantern-cove', 'check', 'echo all tides ok');
  expect(set.code, set.stdout).toBe(0);
  const passed = await cli.mesa('check', 'lantern-cove');
  expect(passed.code).toBe(0);
  expect(passed.stdout.trim()).toMatch(/^check passed: echo all tides ok \(.+ s\); log \/.+\.log$/);

  writeFileSync(
    join(dir, 'mesa.yaml'),
    'name: lantern-cove\ncheck: "echo row 1; echo error: buoy 7 missing; exit 2"\n',
  );
  // Changed in the file, it waits for a person's approval.
  const refused = await cli.mesa('check', 'lantern-cove', '--json');
  expect(refused.json.error.code).toBe('needs_approval');
  const fingerprint = /--expect ([0-9a-f]{64})/.exec(refused.json.error.message)?.[1] ?? '';
  expect((await cli.mesa('projects', 'trust', 'lantern-cove', '--expect', fingerprint)).code).toBe(
    0,
  );
  const failed = await cli.mesa('check', 'lantern-cove', '--json');
  expect(failed.code).toBe(1);
  expect(failed.json.data).toMatchObject({
    ok: false,
    exitCode: 2,
    errors: ['row 1', 'error: buoy 7 missing'],
  });
  expect(readFileSync(failed.json.data.log, 'utf8')).toBe('row 1\nerror: buoy 7 missing\n');
  const text = await cli.mesa('check', 'lantern-cove');
  expect(text.stdout).toContain(
    'check failed: echo row 1; echo error: buoy 7 missing; exit 2 exited 2',
  );
  expect((await cli.mesa('help', '--agent')).stdout).toContain('mesa check');
});
