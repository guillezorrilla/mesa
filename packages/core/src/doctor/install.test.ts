import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/index.js';
import { INSTALLABLE } from './doctor.js';
import { installRequirement } from './install.js';

test('installs tmux, the agents, gh and twg with their Homebrew command', async () => {
  const { run, calls } = scriptedRunner();
  expect(await installRequirement(run, 'tmux')).toEqual({ name: 'tmux', installed: true });
  await installRequirement(run, 'claude');
  await installRequirement(run, 'gh');
  await installRequirement(run, 'twg');
  expect(calls.map((c) => [c.file, ...c.args].join(' '))).toEqual([
    'brew install tmux',
    'brew install --cask claude-code',
    'brew install gh',
    'brew install atlassian/twg/twg',
  ]);
  expect([...INSTALLABLE.keys()]).toEqual(
    expect.arrayContaining(['tmux', 'claude', 'codex', 'gh', 'twg']),
  );
});

test('without Homebrew: not_found naming brew.sh', async () => {
  const { run } = scriptedRunner({}, { missing: ['brew'] });
  await expect(installRequirement(run, 'tmux')).rejects.toMatchObject({
    code: 'not_found',
    message: expect.stringContaining('https://brew.sh'),
  });
});

test('a failing brew and an unknown name', async () => {
  const { run } = scriptedRunner({}, { failing: ['brew'] });
  await expect(installRequirement(run, 'codex')).rejects.toMatchObject({ code: 'internal' });
  await expect(installRequirement(run, 'nope')).rejects.toMatchObject({ code: 'usage' });
});
