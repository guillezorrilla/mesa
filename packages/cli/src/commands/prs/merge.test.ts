import { scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

// lantern-cove's origin is the invented acme/lantern-cove; gh answers PR 7's merge state.
const cli = cliHarness();
beforeEach(cli.reset);

async function world(checks = 'SUCCESS') {
  await cli.withProject();
  const scripted = scriptedRunner({
    git: (args) => (args.includes('get-url') ? 'git@github.com:acme/lantern-cove.git\n' : ''),
    gh: (args) =>
      args[0] === 'api'
        ? JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  state: 'OPEN',
                  mergeable: 'MERGEABLE',
                  headRefOid: 'c0ffee1234',
                  commits: { nodes: [{ commit: { statusCheckRollup: { state: checks } } }] },
                },
              },
            },
          })
        : '',
  });
  cli.run = scripted.run;
  return () => scripted.calls.filter((c) => c.args[1] === 'merge').map((c) => c.args);
}

test('prs merge --json squash-merges by default and names the receipt', async () => {
  const merges = await world();
  const done = await cli.mesa('prs', 'merge', 'lantern-cove', '7', '--caller', 'app', '--json');
  expect(done.code, done.stdout).toBe(0);
  expect(done.json.data).toMatchObject({ project: 'lantern-cove', number: 7, method: 'squash' });
  expect(done.json.data.receipt).toMatchObject({ id: expect.any(String) });
  expect(merges()).toEqual([
    [
      'pr',
      'merge',
      '7',
      '--repo',
      'acme/lantern-cove',
      '--squash',
      '--match-head-commit',
      'c0ffee1234',
    ],
  ]);
});

test('prs merge takes a URL and a method flag', async () => {
  const merges = await world();
  const done = await cli.mesa(
    'prs',
    'merge',
    'https://github.com/acme/lantern-cove/pull/7',
    '--rebase',
  );
  expect(done.stdout).toContain('Merged lantern-cove #7 (rebase) at c0ffee1');
  expect(merges()[0]).toContain('--rebase');
});

test('prs merge refuses failing checks without --yes, and two methods', async () => {
  const merges = await world('FAILURE');
  const refused = await cli.mesa('prs', 'merge', 'lantern-cove', '7', '--json');
  expect(refused.code).toBe(2);
  expect(refused.json.error).toMatchObject({
    code: 'usage',
    details: { refused: 'checks-failing' },
  });
  expect(merges()).toEqual([]);
  const both = await cli.mesa('prs', 'merge', 'lantern-cove', '7', '--merge', '--rebase', '--yes');
  expect(both.code).toBe(2);
  expect(merges()).toEqual([]);
  const yes = await cli.mesa('prs', 'merge', 'lantern-cove', '7', '--merge', '--yes', '--json');
  expect(yes.code, yes.stdout).toBe(0);
  expect(merges()[0]).toContain('--merge');
});
