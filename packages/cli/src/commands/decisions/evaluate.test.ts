import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEXT_STEP_REQUEST, normalAnswer } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

// Decision assistance for sessions (#462): evaluate, context and advise.

test('evaluate, advise and context answer a session alike, in JSON and in words', async () => {
  const { world, id } = await cli.withAssistedSession();
  cli.stdin = JSON.stringify(NEXT_STEP_REQUEST);
  const evaluated = await cli.mesa('decisions', 'evaluate', '--json');
  expect(evaluated).toMatchObject({ code: 0, stderr: '' });
  expect(evaluated.json.data).toMatchObject({
    session: id,
    site: 'next-step',
    evaluation: { status: 'accepted', answer: 'add-retry', model: 'jev-1.13.0' },
  });
  cli.stdin = JSON.stringify({ candidates: NEXT_STEP_REQUEST.candidates });
  const advised = await cli.mesa('decisions', 'advise', 'next-step', '--json');
  expect(normalAnswer(advised.json.data)).toEqual(normalAnswer(evaluated.json.data));
  expect(world.requests).toHaveLength(1);
  cli.stdin = JSON.stringify({ candidates: NEXT_STEP_REQUEST.candidates });
  expect((await cli.mesa('decisions', 'advise', 'next-step')).stdout).toBe(
    'Suggested next step: add-retry (margin 0.70, jev-1.13.0). Advice only: weigh it and act yourself.\naccepted, jev-1.13.0, margin 0.70, ready answer\n',
  );
  const put = (path: string, text: string) => {
    mkdirSync(join(cli.home, 'vault', path, '..'), { recursive: true });
    writeFileSync(join(cli.home, 'vault', path), text);
  };
  put('projects/lantern-cove/retry.md', '# Retry\n\nThe feed import retries through the helper.\n');
  const context = await cli.mesa('decisions', 'context', 'feed retry', '--json');
  expect(context.json.data).toMatchObject({
    query: 'feed retry',
    required: { goal: 'Make the feed import retry' },
    sources: [{ id: 'note:projects/lantern-cove/retry.md' }],
  });
  cli.stdin = JSON.stringify({ site: 'relevance', query: 'feed retry' });
  expect(normalAnswer((await cli.mesa('decisions', 'evaluate', '--json')).json.data)).toEqual(
    normalAnswer(context.json.data),
  );
  expect((await cli.mesa('decisions', 'context')).stdout).toContain(
    '1. note:projects/lantern-cove/retry.md  Retry',
  );
});

test('a session reaches only its own context; a person names one; bad input is usage', async () => {
  const { world, id } = await cli.withAssistedSession();
  const other = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  expect(await cli.mesa('decisions', 'context', '--session', other)).toMatchObject({
    code: 2,
    stderr: `session ${id} uses only its own context, not session ${other}'s\n`,
  });
  cli.env = {};
  expect((await cli.mesa('decisions', 'context')).stderr).toBe(
    'not in a Mesa session: name one with --session <id>\n',
  );
  cli.stdin = JSON.stringify(NEXT_STEP_REQUEST);
  expect(
    (await cli.mesa('decisions', 'evaluate', '--session', other, '--json')).json.data.session,
  ).toBe(other);
  cli.stdin = 'not json';
  expect((await cli.mesa('decisions', 'evaluate', '--session', other)).code).toBe(2);
  expect((await cli.mesa('decisions', 'advise', 'supervision', '--session', other)).stderr).toBe(
    'advise next-step or evidence, not supervision\n',
  );
  await cli.mesa('stop', other);
  cli.stdin = JSON.stringify(NEXT_STEP_REQUEST);
  expect((await cli.mesa('decisions', 'evaluate', '--session', other)).stderr).toMatch(/ended at/);
  expect(world.requests).toHaveLength(1);
});
