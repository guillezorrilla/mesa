import { expect, test } from 'vitest';
import { followRoute, routedBridge } from './followRoutes';

const bridged: string[][] = [];
const bridge = async (args: string[]) => {
  bridged.push(args);
  return { ok: true, data: 'spawned' };
};

test('a chat action for a followed session goes over its follow; another, or one it cannot take, spawns', async () => {
  const written: string[] = [];
  const channel = followRoute(async (line) => void written.push(line));
  const routes = new Map([['a1b2c3d4', channel.route]]);
  const send = routedBridge(bridge, routes);
  const sent = send(['--json', 'sessions', 'mode', '--', 'a1b2c3d4', 'plan']);
  await Promise.resolve();
  expect(JSON.parse(written[0] ?? '')).toEqual({
    type: 'run',
    id: 'r1',
    argv: ['sessions', 'mode', '--', 'a1b2c3d4', 'plan'],
  });
  channel.answered('r1', { ok: true, data: 'over the follow' });
  expect(await sent).toEqual({ ok: true, data: 'over the follow' });
  expect(await send(['--json', 'rename', '--', 'a1b2c3d4', 'x'])).toEqual({
    ok: true,
    data: 'spawned',
  });
  routes.set('a1b2c3d4', followRoute(async () => Promise.reject(new Error('restarting'))).route);
  expect(await send(['--json', 'prompt', '--', 'a1b2c3d4'])).toEqual({ ok: true, data: 'spawned' });
  expect(bridged.map((a) => a[1])).toEqual(['rename', 'prompt']);
});

test('a request out when its follow ends is lost, not sent again', async () => {
  const channel = followRoute(async () => {});
  const out = channel.route(['--json', 'send', '--no-from', '--', 'a1b2c3d4', 'hi']);
  await Promise.resolve();
  channel.end();
  expect(await out).toMatchObject({ ok: false, error: { code: 'agent_unavailable' } });
});
