import { expect, test } from 'vitest';
import { projectProfile } from '../testing/profile.js';
import { scriptedRunner } from '../testing/runner.js';
import { newSession, testStore } from '../testing/sessions.js';
import { tempDir } from '../testing/tmp.js';

// lantern-cove's origin is the invented acme/lantern-cove; gh answers the thread mutation.
function world(origin = 'git@github.com:acme/lantern-cove.git', over = {}) {
  const { run, calls } = scriptedRunner({
    git: (args) => (args.includes('get-url') ? `${origin}\n` : ''),
    gh: (args) => {
      const query = args.find((a) => a.startsWith('query=')) ?? '';
      if (query.includes('node(id:'))
        return JSON.stringify({
          data: {
            node: args.includes('thread=PRRT_1')
              ? { pullRequest: { number: 7, repository: { nameWithOwner: 'acme/lantern-cove' } } }
              : null,
          },
        });
      const field = query.includes('unresolveReviewThread')
        ? 'unresolveReviewThread'
        : 'resolveReviewThread';
      const isResolved = field === 'resolveReviewThread';
      return JSON.stringify({ data: { [field]: { thread: { id: 'PRRT_1', isResolved } } } });
    },
  });
  const { mesa } = projectProfile(run, over);
  const gh = () => calls.filter((c) => c.file === 'gh');
  return { mesa, gh };
}

test('a person resolves a thread and opens it again, each one mutation with a receipt', async () => {
  const { mesa, gh } = world();
  const done = await mesa.prs.resolve('lantern-cove', 7, 'PRRT_1');
  expect(done.result).toEqual({ thread: 'PRRT_1', resolved: true });
  const again = await mesa.prs.resolve('lantern-cove', 7, 'PRRT_1', false);
  expect(again.result).toEqual({ thread: 'PRRT_1', resolved: false });
  const writes = gh().filter((c) => c.args.some((a) => a.startsWith('query=mutation')));
  expect(
    writes.map((c) => c.args.find((a) => a.startsWith('query='))?.match(/\w+ReviewThread/)?.[0]),
  ).toEqual(['resolveReviewThread', 'unresolveReviewThread']);
  expect(gh()[0]?.args).toEqual(expect.arrayContaining(['-f', 'thread=PRRT_1']));
  expect(mesa.receipts.list({})[0]?.receipt).toMatchObject({
    kind: 'connection',
    project: 'lantern-cove',
    inputs: { project: 'lantern-cove', number: 7, thread: 'PRRT_1', resolved: false },
  });
});

test('a Bitbucket project is refused before any call', async () => {
  const { mesa, gh } = world('https://bitbucket.org/acme/lantern-cove.git');
  await expect(mesa.prs.resolve('lantern-cove', 7, '12')).rejects.toMatchObject({ code: 'usage' });
  expect(gh()).toEqual([]);
});

test('a review session may not resolve: it reads untrusted PR text', async () => {
  const home = tempDir();
  const review = { pr: 7, round: 1, mode: 'post' as const, head: 'c'.repeat(40) };
  const id = testStore(home).create(() => newSession({ review })).id;
  const { mesa, gh } = world(undefined, {
    home,
    env: { MESA_SESSION_ID: id, MESA_PROFILE: 'default' },
  });
  await expect(mesa.prs.resolve('lantern-cove', 7, 'PRRT_1')).rejects.toMatchObject({
    code: 'usage',
    message: `review session ${id} cannot resolve threads; a person does`,
  });
  expect(gh()).toEqual([]);
});

test('a thread on another PR, or an id that is no thread, is refused before any write', async () => {
  const { mesa, gh } = world();
  await expect(mesa.prs.resolve('lantern-cove', 8, 'PRRT_1')).rejects.toMatchObject({
    code: 'not_found',
  });
  await expect(mesa.prs.resolve('lantern-cove', 7, 'PRRT_9')).rejects.toMatchObject({
    code: 'not_found',
  });
  expect(gh().some((c) => c.args.some((a) => a.includes('resolveReviewThread')))).toBe(false);
});
