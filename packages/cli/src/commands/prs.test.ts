import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented projects whose origin remotes a scripted git answers: lantern-cove on GitHub with a
// ready gh, tide-pool on Bitbucket with no twg, driftwood with no remote.

const cli = cliHarness();
beforeEach(cli.reset);

const REMOTES: Record<string, string> = {
  'lantern-cove': 'git@github.com:acme/lantern-cove.git\n',
  'tide-pool': 'https://bitbucket.org/acme-eng/tide-pool.git\n',
};
const GH_VERSION = 'gh version 2.62.0 (2026-01-01)\n';

const pr = (number: number, author: string, over: object = {}) => ({
  number,
  title: `Change ${number}`,
  url: `https://github.com/acme/lantern-cove/pull/${number}`,
  headRefName: `feat/${number}`,
  updatedAt: `2026-10-1${number % 10}T09:00:00Z`,
  author: { login: author },
  reviewRequests: { nodes: [] },
  reviews: { nodes: [] },
  comments: { nodes: [] },
  commits: { nodes: [{ commit: { committedDate: '2026-10-10T08:00:00Z' } }] },
  reviewThreads: { nodes: [] },
  ...over,
});
const OPEN_PRS = JSON.stringify({
  data: {
    viewer: { login: 'ana-r' },
    repository: {
      pullRequests: {
        nodes: [
          pr(11, 'lee-park', {
            reviews: {
              nodes: [
                {
                  author: { login: 'ana-r' },
                  state: 'COMMENTED',
                  submittedAt: '2026-10-10T09:00:00Z',
                },
              ],
            },
          }),
          pr(12, 'dana-ruiz', {
            reviewRequests: { nodes: [{ requestedReviewer: { login: 'ana-r' } }] },
          }),
          pr(13, 'ana-r'),
          pr(14, 'kofi-m'),
        ],
      },
    },
  },
});

async function world() {
  await cli.withProject();
  for (const name of ['tide-pool', 'driftwood']) {
    const dir = join(cli.home, 'src', name);
    mkdirSync(dir, { recursive: true });
    await cli.mesa('register', '--create', dir);
  }
  cli.run = scriptedRunner(
    {
      git: (args) =>
        REMOTES[args[1]?.split('/').at(-1) ?? ''] ?? {
          ok: false,
          reason: 'failed',
          detail: 'No such remote',
        },
      gh: (args) => (args[0] === 'api' ? OPEN_PRS : GH_VERSION),
    },
    { missing: ['twg'] },
  ).run;
}

test('prs setup --json lists each project with its provider, CLI state and next step', async () => {
  await world();
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

test('prs --json lists the PRs that need me, most urgent first, and the blocked projects', async () => {
  await world();
  const listed = await cli.mesa('prs', '--json');
  expect(listed.code, listed.stdout).toBe(0);
  // Mine (#13) never shows; #14 is not for me; #12 asks me first, then #11 waits on Lee.
  expect(
    listed.json.data.prs.map((p: { number: number; bucket: string }) => [p.number, p.bucket]),
  ).toEqual([
    [12, 'need'],
    [11, 'waiting'],
  ]);
  expect(listed.json.data.prs[0]).toMatchObject({
    project: 'lantern-cove',
    provider: 'github',
    author: 'dana-ruiz',
    url: 'https://github.com/acme/lantern-cove/pull/12',
    since: { commits: 1, replies: 0, resolved: 0, threads: 0 },
  });
  expect(listed.json.data.blocked).toMatchObject([{ project: 'tide-pool', state: 'missing' }]);

  const all = await cli.mesa('prs', '--all', '--project', 'lantern-cove', '--json');
  expect(all.json.data.prs.map((p: { number: number }) => p.number)).toEqual([12, 11, 14]);
  expect(all.json.data.blocked).toEqual([]);

  const text = await cli.mesa('prs');
  expect(text.stdout).toMatch(/lantern-cove\s+#12\s+Needs your review\s+dana-ruiz/);
  expect(text.stdout).toContain('tide-pool: twg missing; run brew install atlassian/twg/twg');

  const unknown = await cli.mesa('prs', '--project', 'nowhere', '--json');
  expect(unknown.code).not.toBe(0);
});

test('prs --json keeps listing when a repo fails to read, and names the quiet projects', async () => {
  await world();
  const run = cli.run;
  let failing = true;
  cli.run = (file, args, ...rest) =>
    file === 'gh' && args[0] === 'api' && failing
      ? Promise.resolve({ ok: false, reason: 'failed', detail: 'HTTP 502' })
      : run(file, args, ...rest);
  const failed = await cli.mesa('prs', '--json');
  expect(failed.code, failed.stdout).toBe(0);
  expect(failed.json.data).toMatchObject({
    prs: [],
    problems: [{ project: 'lantern-cove', reason: 'gh failed: HTTP 502' }],
    blocked: [{ project: 'tide-pool' }],
    quiet: [],
  });

  // Read fine but with only my own PR: lantern-cove is quiet; driftwood has no provider, so is not.
  failing = false;
  const mineOnly = JSON.parse(OPEN_PRS);
  mineOnly.data.repository.pullRequests.nodes = [pr(13, 'ana-r')];
  cli.run = (file, args, ...rest) =>
    file === 'gh' && args[0] === 'api'
      ? Promise.resolve({ ok: true, stdout: JSON.stringify(mineOnly) })
      : run(file, args, ...rest);
  expect((await cli.mesa('prs', '--json')).json.data.quiet).toEqual(['lantern-cove']);
});
