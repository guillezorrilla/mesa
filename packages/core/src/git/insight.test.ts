import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import {
  fakeGh,
  gitProject,
  multiProjectSession,
  projectProfile,
  testStore,
  withRealGit,
} from '../testing/index.js';

test("insight links a PR on the session's branch in a repository where it is an additional project", async () => {
  const gh = fakeGh([
    { number: 42, branch: 'feature', checks: [], reviews: [], comments: [], reviewComments: [] },
  ]);
  const listedIn: (string | undefined)[] = [];
  const run: Runner = async (file, args, _ms, options) => {
    if (file !== 'gh') return { ok: true, stdout: '' };
    if (args[0] === 'pr') listedIn.push(options?.cwd);
    const said = gh.answer(args);
    return typeof said === 'string' ? { ok: true, stdout: said } : said;
  };
  const { home, mesa } = projectProfile(withRealGit(run));
  const tide = gitProject(mesa, home, 'tide-pool');
  const session = testStore(home).create(() => multiProjectSession());

  const insight = await mesa.git.insight('tide-pool');
  expect(listedIn).toEqual([tide]);
  expect(insight.pullRequests.matches).toMatchObject([
    { number: 42, branch: 'feature', sessionIds: [session.id], linkedBy: 'branch-name' },
  ]);
});
