import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented projects whose origin remotes a scripted git answers; gh is ready, twg is not installed.

const cli = cliHarness();
beforeEach(cli.reset);

const REMOTES: Record<string, string> = {
  'lantern-cove': 'git@github.com:acme/lantern-cove.git\n',
  'tide-pool': 'https://bitbucket.org/acme-eng/tide-pool.git\n',
};

test('prs setup --json lists each project with its provider, CLI state and next step', async () => {
  await cli.withProject();
  for (const name of ['tide-pool', 'driftwood']) {
    const dir = join(cli.home, 'src', name);
    mkdirSync(dir, { recursive: true });
    await cli.mesa('register', '--create', dir);
  }
  cli.run = scriptedRunner(
    {
      git: (args) => {
        const remote = REMOTES[args[1]?.split('/').at(-1) ?? ''];
        return remote ?? { ok: false, reason: 'failed', detail: 'No such remote' };
      },
      gh: 'gh version 2.62.0 (2026-01-01)\n',
    },
    { missing: ['twg'] },
  ).run;

  const listed = await cli.mesa('prs', 'setup', '--json');
  expect(listed.code, listed.stdout).toBe(0);
  expect(listed.json.data).toEqual(
    expect.arrayContaining([
      {
        project: 'lantern-cove',
        provider: 'github',
        cli: 'gh',
        state: 'ready',
        version: 'gh version 2.62.0 (2026-01-01)',
        next: null,
      },
      {
        project: 'tide-pool',
        provider: 'bitbucket',
        cli: 'twg',
        state: 'missing',
        next: 'brew install atlassian/twg/twg',
      },
      { project: 'driftwood', provider: null, cli: null, state: null, next: null },
    ]),
  );
  expect(listed.json.data).toHaveLength(3);

  const text = await cli.mesa('prs', 'setup');
  expect(text.stdout).toMatch(
    /tide-pool\s+bitbucket\s+twg\s+missing\s+brew install atlassian\/twg\/twg/,
  );
});
