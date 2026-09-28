import { scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('agents JSON and text expose the same provider capability catalog used by launch guards', async () => {
  cli.run = scriptedRunner(
    { tmux: 'tmux 3.7c', claude: 'Claude Code 2.1.282' },
    { missing: ['codex', 'agy'] },
  ).run;
  const { json, stdout } = await cli.mesa('agents', '--json');
  expect(json.data).toMatchObject({
    claude: {
      installed: true,
      matchesVerifiedVersion: false,
      plan: true,
      background: true,
      fork: true,
      adopt: true,
    },
    codex: { installed: false, plan: false, background: false, fork: true, adopt: true },
    antigravity: { installed: false, plan: true, background: false, fork: false, adopt: false },
  });
  expect(stdout).toContain('"nativeState":"screen-only"');
  expect(stdout).toContain('"verifiedVersion":"1.2.12"');
  const text = await cli.mesa('agents');
  expect(text.stdout).toContain(
    'antigravity: missing; qualified on 1.2.12; current version unverified:',
  );
  expect(text.stdout).toContain('plan=true background=false fork=false');
});

test('agents identifies the installed versions actually qualified in this release', async () => {
  cli.run = scriptedRunner({
    tmux: 'tmux 3.7c',
    claude: 'Claude Code 2.1.284',
    codex: 'codex-cli 0.157.1',
    agy: 'agy 1.2.12',
  }).run;
  const { json } = await cli.mesa('agents', '--json');
  for (const agent of ['claude', 'codex', 'antigravity']) {
    expect(json.data[agent]).toMatchObject({ installed: true, matchesVerifiedVersion: true });
  }
});
