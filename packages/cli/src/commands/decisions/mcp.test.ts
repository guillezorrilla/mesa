import type { Stdio } from '@mesa/core';
import { driveMcp, mcpInitialize, NEXT_STEP_REQUEST, normalAnswer, rpc } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('decisions mcp serves the same answers over stdio, and prints its tool with --tools', async () => {
  const { world, id } = await cli.withAssistedSession();
  const tools = (await cli.mesa('decisions', 'mcp', '--tools', '--json')).json.data.tools;
  expect(tools.map((t: { name: string }) => t.name)).toEqual(['decision_evaluate']);
  const started = await cli.mesa('decisions', 'mcp');
  expect([started.code, started.stdout, started.stderr]).toEqual([0, '', '']);
  const out = await driveMcp(
    started.serve as (io: Stdio) => Promise<void>,
    mcpInitialize(),
    rpc(2, 'tools/list'),
    rpc(3, 'tools/call', { name: 'decision_evaluate', arguments: NEXT_STEP_REQUEST }),
  );
  expect(out.reply(2)?.result?.tools).toEqual(tools);
  cli.stdin = JSON.stringify(NEXT_STEP_REQUEST);
  const cliAnswer = (await cli.mesa('decisions', 'evaluate', '--json')).json.data;
  expect(normalAnswer(JSON.parse(out.text(3)))).toEqual(normalAnswer(cliAnswer));
  expect(world.requests).toHaveLength(1);
  // The call through the tool is what show observes, apart from the CLI's.
  cli.env = {};
  expect((await cli.mesa('show', id, '--json')).json.data.decisions.tool).toMatchObject({
    state: 'configured',
    observedAt: '2026-09-24T12:00:00.000Z',
  });
});
