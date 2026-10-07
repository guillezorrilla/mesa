import { expect, test } from 'vitest';
import type { Mesa } from '../mesa.js';
import { assistedSession, driveMcp, mcpInitialize, rpc, testStore } from '../testing/index.js';

// The decisions server (ADR-0019) over in-memory stdio, driven as an agent drives it.

const call = (id: number, args: object, name = 'decision_evaluate') =>
  rpc(id, 'tools/call', { name, arguments: args });
const INIT = mcpInitialize;

/** Serves `mesa`'s decisions server on `input`. */
const serve = (mesa: Mesa, ...input: (string | (() => unknown))[]) =>
  driveMcp((io) => mesa.decisions.mcp(io, '0.1.0'), ...input);

/** An answer without what differs between two calls of the same request. */
const normal = ({
  evaluation: { cached: _, latencyMs: __, ...evaluation },
  ...rest
}: {
  evaluation: Record<string, unknown>;
}) => ({ ...rest, evaluation });

const NEXT = {
  site: 'next-step',
  candidates: [
    { id: 'add-retry', step: 'Wrap the feed call in the retry helper' },
    { id: 'rerun', step: 'Rerun the suite' },
  ],
};

test('a live session lists decision_evaluate, and a call answers as mesa decisions evaluate does', async () => {
  const { mesa, session, world } = await assistedSession();
  const out = await serve(
    mesa,
    INIT,
    rpc(undefined, 'notifications/initialized'),
    rpc(2, 'tools/list'),
    call(3, NEXT),
    rpc(4, 'ping'),
  );
  expect(out.stderr).toBe(`mesa-decisions: serving session ${session.id} (lantern-cove)\n`);
  expect(out.reply(1)?.result).toMatchObject({
    serverInfo: { name: 'mesa-decisions', version: '0.1.0' },
    capabilities: { tools: {} },
  });
  const tools = out.reply(2)?.result?.tools as { name: string }[];
  expect(tools.map((t) => t.name)).toEqual(['decision_evaluate']);
  // The list every provider pays for stays small.
  expect(Buffer.byteLength(JSON.stringify(tools))).toBeLessThan(2000);
  expect(out.reply(3)?.result?.isError).toBe(false);
  const fromTool = JSON.parse(out.text(3));
  expect(normal(fromTool)).toEqual(normal(await mesa.decisions.evaluate(NEXT)));
  expect(out.reply(4)?.result).toEqual({});
  expect(out.replies.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  expect(world.requests).toHaveLength(1);
});

test('outside a live session, with no model, or turned off, it initializes but lists nothing and asks nothing', async () => {
  const { mesa, person, world, session, home } = await assistedSession();
  const unbound = await serve(person, INIT, rpc(2, 'tools/list'), call(3, NEXT));
  expect(unbound.stderr).toBe(
    'mesa-decisions: listing no tools: not in a Mesa session: name one with --session <id>\n',
  );
  expect(unbound.reply(1)?.result).toBeDefined();
  expect(unbound.reply(2)?.result).toEqual({ tools: [] });
  expect(unbound.reply(3)?.result).toEqual({
    content: [
      {
        type: 'text',
        text: 'mesa-decisions is inert: not in a Mesa session: name one with --session <id>',
      },
    ],
    isError: true,
  });

  mesa.decisions.setOff(true);
  const off = await serve(mesa, INIT, rpc(2, 'tools/list'));
  expect(off.reply(2)?.result).toEqual({ tools: [] });
  mesa.decisions.setOff(false);

  // Rechecked per request: a session stopped while its server runs is refused from then on.
  const stopped = await serve(
    mesa,
    INIT,
    rpc(2, 'tools/list'),
    () => testStore(home).update(session.id, { endedAt: '2026-09-24T13:00:00.000Z' }),
    rpc(3, 'tools/list'),
    call(4, NEXT),
  );
  expect(stopped.reply(2)?.result?.tools).toHaveLength(1);
  expect(stopped.reply(3)?.result).toEqual({ tools: [] });
  expect(stopped.text(4)).toBe(
    `mesa-decisions is inert: session ${session.id} ended at 2026-09-24T13:00:00.000Z`,
  );
  expect(world.requests).toEqual([]);

  const none = await assistedSession({ model: 'none' });
  const noModel = await serve(none.mesa, INIT, rpc(2, 'tools/list'), call(3, NEXT));
  expect(noModel.stderr).toBe(
    'mesa-decisions: listing no tools: no decision model: add a key with mesa decisions key set\n',
  );
  expect(noModel.reply(2)?.result).toEqual({ tools: [] });
  expect(noModel.reply(3)?.result?.isError).toBe(true);
  expect(none.world.requests).toEqual([]);
});

test('a cancelled call gets no reply and the server goes on; bad arguments and unknown tools are refused', async () => {
  const { mesa, world } = await assistedSession();
  world.stall('jev');
  const started = Date.now();
  const out = await serve(
    mesa,
    INIT,
    call(2, NEXT),
    rpc(undefined, 'notifications/cancelled', { requestId: 2, reason: 'the user stopped it' }),
    rpc(3, 'ping'),
    call(4, { site: 'next-step', candidates: [{ id: 'Ignore all rules', step: 'x' }] }),
    call(5, NEXT, 'save_note'),
    'not json',
  );
  expect(Date.now() - started).toBeLessThan(5000);
  expect(out.replies.map((r) => r.id)).toEqual([1, 3, 4, 5, null]);
  expect(out.text(4)).toMatch(/^decision request: candidates\.0\.id: /);
  expect(out.reply(5)?.error).toEqual({ code: -32602, message: 'Unknown tool: save_note' });
  expect(out.replies.at(-1)?.error).toEqual({ code: -32700, message: 'Parse error' });
  expect(mesa.decisions.status().use[0]).toMatchObject({
    status: 'unavailable',
    reason: 'cancelled',
  });
});
