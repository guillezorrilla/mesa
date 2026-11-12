import { expect, test } from 'vitest';
import type { RunResult } from '../lib/process.js';
import { projectProfile } from '../testing/profile.js';
import { scriptedRunner } from '../testing/runner.js';
import { newSession, testStore } from '../testing/sessions.js';
import { tempDir } from '../testing/tmp.js';

// lantern-cove's origin is the invented acme/lantern-cove; gh answers PR 7's merge state.
type Pr = { state?: string; mergeable?: string; checks?: string | null; mergeFails?: string };

function world(
  pr: Pr = {},
  origin = 'git@github.com:acme/lantern-cove.git',
  over: Parameters<typeof projectProfile>[1] = {},
) {
  const { state = 'OPEN', mergeable = 'MERGEABLE', checks = 'SUCCESS', mergeFails } = pr;
  const { run, calls } = scriptedRunner({
    git: (args) => (args.includes('get-url') ? `${origin}\n` : ''),
    gh: (args): string | RunResult => {
      if (args[0] === 'api')
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                state,
                mergeable,
                headRefOid: 'c0ffee1',
                commits: {
                  nodes: [{ commit: { statusCheckRollup: checks ? { state: checks } : null } }],
                },
              },
            },
          },
        });
      if (args[0] === 'pr' && args[1] === 'merge')
        return mergeFails ? { ok: false, reason: 'failed', detail: mergeFails } : '';
      return 'gh version 2.62.0 (2026-01-01)\n';
    },
  });
  const { mesa } = projectProfile(run, over);
  const merges = () => calls.filter((c) => c.file === 'gh' && c.args[1] === 'merge');
  const receipt = () => mesa.receipts.list({})[0]?.receipt;
  return { mesa, calls, merges, receipt };
}

const PR = { project: 'lantern-cove', number: 7 };

test.each(['squash', 'merge', 'rebase'] as const)(
  '%s merges at the head it read, never with --admin, and the receipt names it',
  async (method) => {
    const { mesa, calls, merges, receipt } = world();
    const done = await mesa.prs.merge(PR, { method, caller: 'app' });
    expect(done.result).toEqual({ ...PR, method, head: 'c0ffee1', checks: 'passing' });
    expect(merges().map((c) => c.args)).toEqual([
      [
        'pr',
        'merge',
        '7',
        '--repo',
        'acme/lantern-cove',
        `--${method}`,
        '--match-head-commit',
        'c0ffee1',
      ],
    ]);
    expect(calls.flatMap((c) => c.args)).not.toContain('--admin');
    expect(receipt()).toMatchObject({
      kind: 'merge',
      project: 'lantern-cove',
      inputs: { ...PR, method, caller: 'app' },
    });
  },
);

test('squash is the default and the CLI the default caller', async () => {
  const { mesa, merges, receipt } = world({ checks: null });
  const done = await mesa.prs.merge(PR);
  expect(done.result.method).toBe('squash');
  expect(merges()[0]?.args).toContain('--squash');
  expect(receipt()?.inputs).toEqual({ ...PR, method: 'squash', caller: 'cli' });
});

test('failing checks are refused until confirmed', async () => {
  const { mesa, merges, receipt } = world({ checks: 'FAILURE' });
  await expect(mesa.prs.merge(PR)).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringContaining('has failing checks'),
    details: { refused: 'checks-failing', checks: 'failing' },
  });
  expect(merges()).toEqual([]);
  await mesa.prs.merge(PR, { confirm: true });
  expect(merges()).toHaveLength(1);
  expect(receipt()?.inputs).toMatchObject({ confirmed: 'checks-failing' });
});

test('a conflict is refused until confirmed', async () => {
  const { mesa, merges } = world({ mergeable: 'CONFLICTING' });
  await expect(mesa.prs.merge(PR)).rejects.toMatchObject({
    message: expect.stringContaining('conflicts with its base'),
    details: { refused: 'conflicting' },
  });
  expect(merges()).toEqual([]);
});

test('a closed PR is refused, confirmed or not', async () => {
  const { mesa, merges } = world({ state: 'CLOSED' });
  await expect(mesa.prs.merge(PR, { confirm: true })).rejects.toMatchObject({
    code: 'usage',
    message: 'lantern-cove #7 is closed',
  });
  expect(merges()).toEqual([]);
});

test("a URL names the registered project whose origin is the URL's repo", async () => {
  const { mesa, merges } = world();
  const done = await mesa.prs.merge({ url: 'https://github.com/Acme/lantern-cove/pull/7' });
  expect(done.result).toMatchObject(PR);
  expect(merges()).toHaveLength(1);
  await expect(
    mesa.prs.merge({ url: 'https://github.com/acme/elsewhere/pull/7' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(mesa.prs.merge({ url: 'https://example.com/pull/7' })).rejects.toMatchObject({
    code: 'usage',
  });
});

test('a Bitbucket project is refused before any merge', async () => {
  const { mesa, merges } = world({}, 'https://bitbucket.org/acme/lantern-cove.git');
  await expect(mesa.prs.merge(PR)).rejects.toMatchObject({
    message: expect.stringContaining('merges through gh only'),
  });
  expect(merges()).toEqual([]);
});

test("a merge gh refuses is reported with gh's reason", async () => {
  const { mesa } = world({ mergeFails: 'base branch policy prohibits the merge' });
  await expect(mesa.prs.merge(PR)).rejects.toMatchObject({
    code: 'internal',
    message: 'gh failed: base branch policy prohibits the merge',
  });
});

test('a review session may never merge: it reads untrusted PR text', async () => {
  const home = tempDir();
  const review = { pr: 7, round: 1, mode: 'post' as const, head: 'c'.repeat(40) };
  const id = testStore(home).create(() => newSession({ review })).id;
  const { mesa, calls } = world({}, undefined, {
    home,
    env: { MESA_SESSION_ID: id, MESA_PROFILE: 'default' },
  });
  await expect(mesa.prs.merge(PR, { confirm: true })).rejects.toMatchObject({
    code: 'usage',
    message: `review session ${id} cannot merge; a person merges`,
  });
  expect(calls.filter((c) => c.file === 'gh')).toEqual([]);
});
