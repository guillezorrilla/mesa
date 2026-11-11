import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLAUDE_VERSION, fakeTmux, movableClock, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

// Invented sessions in a fake tmux; a child's hook events are written as `mesa hook claude` does.

const cli = cliHarness();
beforeEach(cli.reset);

const hook = (id: string, event: string, at: string, payload: Record<string, unknown> = {}) => {
  mkdirSync(cli.paths.events, { recursive: true });
  appendFileSync(
    join(cli.paths.events, `${id}.jsonl`),
    `${JSON.stringify({ at, agent: 'claude', event, payload: { hook_event_name: event, ...payload } })}\n`,
  );
};

test("reports lists a child's finished turn for its parent, and --deliver types it once into the idle parent", async () => {
  const tmux = fakeTmux();
  cli.run = scriptedRunner({ tmux: tmux.answer, claude: CLAUDE_VERSION }).run;
  await cli.withProject();
  await cli.mesa('config', 'set', 'sessions.reportHoldSeconds', '0');
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (await cli.mesa('open', 'lantern-cove', '--parent', parent, '--json')).json.data
    .id as string;
  expect((await cli.mesa('reports', '--json')).json.data).toEqual({
    enabled: true,
    reports: [],
    questions: [],
  });

  hook(child, 'Stop', '2026-09-24T12:00:20.000Z', {
    last_assistant_message: 'Tide tables parsed.',
  });
  const listed = await cli.mesa('reports', parent, '--json');
  expect(listed.code, listed.stdout).toBe(0);
  expect(listed.json.data.reports).toMatchObject([
    { parent, child, kind: 'finished', message: 'Tide tables parsed.' },
  ]);
  expect((await cli.mesa('reports', 'zzzzzzzz', '--json')).json.error.code).toBe('not_found');

  hook(parent, 'Stop', '2026-09-24T12:00:30.000Z');
  const sent = await cli.mesa('reports', '--deliver', '--json');
  expect(sent.code, sent.stdout).toBe(0);
  expect(sent.json.data.deliveries).toMatchObject([
    { session: parent, status: 'delivered', state: 'idle', receipt: { id: expect.any(String) } },
  ]);
  const typed = tmux.windows.find((w) => w.window === `claude-${parent}`)?.typed ?? [];
  expect(typed).toHaveLength(1);
  expect(typed[0]).toContain(`- ${child} (`);
  expect(typed[0]).toContain('Tide tables parsed.');
  expect((await cli.mesa('reports', '--deliver', '--json')).json.data.deliveries).toEqual([]);

  await cli.mesa('config', 'set', 'sessions.childReports', 'false');
  const off = await cli.mesa('reports', '--deliver', '--json');
  expect(off.code).toBe(2);
  expect(off.json.error.message).toMatch(/sessions\.childReports/);
});

test('a finished turn is held: reports lists heldUntil, --deliver leaves it pending under held until the child has stayed idle', async () => {
  const tmux = fakeTmux();
  const time = movableClock();
  cli.run = scriptedRunner({ tmux: tmux.answer, claude: CLAUDE_VERSION }).run;
  cli.deps = { clock: time.clock };
  await cli.withProject();
  const parent = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const child = (await cli.mesa('open', 'lantern-cove', '--parent', parent, '--json')).json.data
    .id as string;
  await cli.mesa('reports', '--json');
  hook(child, 'Stop', '2026-09-24T12:00:20.000Z', { last_assistant_message: 'Tides counted.' });
  hook(parent, 'Stop', '2026-09-24T12:00:30.000Z');
  expect((await cli.mesa('reports', '--json')).json.data.reports).toMatchObject([
    { child, kind: 'finished', heldUntil: '2026-09-24T12:02:20.000Z' },
  ]);
  const early = await cli.mesa('reports', '--deliver', '--json');
  expect(early.code, early.stdout).toBe(0);
  expect(early.json.data).toMatchObject({
    deliveries: [],
    held: [{ child, heldUntil: '2026-09-24T12:02:20.000Z' }],
  });
  const typed = () => tmux.windows.find((w) => w.window === `claude-${parent}`)?.typed ?? [];
  expect(typed()).toEqual([]);
  time.set('2026-09-24T12:02:20.000Z');
  const due = await cli.mesa('reports', '--deliver', '--json');
  expect(due.json.data).toMatchObject({
    deliveries: [{ session: parent, status: 'delivered' }],
    held: [],
  });
  expect(typed()).toEqual([expect.stringContaining('Tides counted.')]);
});
