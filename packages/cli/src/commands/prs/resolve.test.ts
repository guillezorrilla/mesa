import { scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

// lantern-cove's origin is the invented acme/lantern-cove; gh answers the thread mutation.
const cli = cliHarness();
beforeEach(cli.reset);

test('prs resolve --json resolves a thread, and --reopen opens it again', async () => {
  await cli.withProject();
  const scripted = scriptedRunner({
    git: (args) => (args.includes('get-url') ? 'git@github.com:acme/lantern-cove.git\n' : ''),
    gh: (args) => {
      if (args.some((a) => a.includes('node(id:')))
        return JSON.stringify({
          data: {
            node: {
              pullRequest: { number: 7, repository: { nameWithOwner: 'acme/lantern-cove' } },
            },
          },
        });
      const reopen = args.some((a) => a.includes('unresolveReviewThread'));
      const field = reopen ? 'unresolveReviewThread' : 'resolveReviewThread';
      return JSON.stringify({
        data: { [field]: { thread: { id: 'PRRT_1', isResolved: !reopen } } },
      });
    },
  });
  cli.run = scripted.run;
  const done = await cli.mesa('prs', 'resolve', 'lantern-cove', '7', 'PRRT_1', '--json');
  expect(done.code, done.stdout).toBe(0);
  expect(done.json.data).toMatchObject({ thread: 'PRRT_1', resolved: true });
  const reopened = await cli.mesa('prs', 'resolve', 'lantern-cove', '7', 'PRRT_1', '--reopen');
  expect(reopened.stdout).toContain('Reopened PRRT_1');
});
