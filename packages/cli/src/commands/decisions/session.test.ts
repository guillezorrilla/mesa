import { NEXT_STEP_REQUEST } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('status shows each mode, off and on turn a session off and back, and a kept decision prints its receipt', async () => {
  const { world, id } = await cli.withAssistedSession();
  const status = await cli.mesa('decisions', 'status');
  expect(status.stdout).toBe(
    [
      `session ${id} (lantern-cove), model jev`,
      'relevance  automatic  accepts at margin 0.5',
      'next-step  automatic  accepts at margin 0.5',
      'evidence   automatic  accepts at margin 0.5',
      'deadlines 1.5 s per turn, 10 s on demand; 0 ready answers',
      'no decision use yet',
      '',
    ].join('\n'),
  );
  expect((await cli.mesa('decisions', 'off')).stdout).toBe(
    `decision assistance off for session ${id}\n`,
  );
  cli.stdin = JSON.stringify(NEXT_STEP_REQUEST);
  expect((await cli.mesa('decisions', 'evaluate', '--json')).json.data.evaluation).toMatchObject({
    status: 'unavailable',
    reason: `decision assistance is off for session ${id}`,
  });
  expect(
    (await cli.mesa('decisions', 'status', '--json')).json.data.sites.map(
      (s: { mode: string }) => s.mode,
    ),
  ).toEqual(['off', 'off', 'off']);
  await cli.mesa('decisions', 'on');
  expect(world.requests).toEqual([]);
  cli.stdin = JSON.stringify(NEXT_STEP_REQUEST);
  const kept = await cli.mesa(
    'decisions',
    'evaluate',
    '--rationale',
    'The helper is the convention',
  );
  expect(kept.stdout).toMatch(/\nreceipt receipts\/2026\/09\/.*-decision-.*\.md\n$/);
  expect((await cli.mesa('decisions', 'status')).stdout).toMatch(
    /2026-09-24T12:00:00.000Z {2}next-step {2}accepted {2}0 ms/,
  );
});
