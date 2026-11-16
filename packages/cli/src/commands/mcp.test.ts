import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { type McpReply, mcpInitialize, rpc } from '@mesa/core/testing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cliHarness } from '../testing.js';

// `mesa mcp serve`, the Shared MCP server (ADR-0031), on the profile's real socket: each
// connection is bound by its first line and served by `vault mcp` or `decisions mcp` in-process.

const cli = cliHarness();
beforeEach(cli.reset);
afterEach(() => {
  vi.useRealTimers();
});

/** Sends a binding then `lines` on the socket; the replies once the server ends the connection. */
function connection(path: string, binding: object, ...lines: string[]) {
  return new Promise<McpReply[]>((resolve, reject) => {
    const socket = connect(path);
    let read = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      read += chunk;
    });
    socket.on('error', reject);
    socket.on('close', () =>
      resolve(
        read
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as McpReply),
      ),
    );
    socket.end([JSON.stringify(binding), ...lines].map((line) => `${line}\n`).join(''));
  });
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('mcp serve lists the vault tools to a live session and none to a binding without one, in one process', async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  const ended = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  await cli.mesa('stop', ended);
  // Its own environment names a live session: only the binding's counts.
  cli.env = { MESA_SESSION_ID: id, MESA_PROFILE: 'default' };
  // Only the idle timer is faked, so the test ends the server rather than waiting ten minutes.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const started = await cli.mesa('mcp', 'serve');
  expect([started.code, started.stdout, started.stderr]).toEqual([0, '', '']);
  const logged: string[] = [];
  const served = started.serve?.({
    lines: (async function* () {})(),
    write: () => {},
    log: (text) => logged.push(text),
  });
  const path = cli.paths.mcpSocket;
  while (!existsSync(path)) await tick();

  const list = [mcpInitialize(), rpc(2, 'tools/list')];
  const [live, none, stopped, other] = await Promise.all([
    connection(path, { server: 'vault', session: id, profile: 'default' }, ...list),
    connection(path, { server: 'vault', session: '', profile: '' }, ...list),
    connection(path, { server: 'vault', session: ended, profile: 'default' }, ...list),
    connection(path, { server: 'vault', session: id, profile: 'work' }, ...list),
  ]);
  const tools = (replies: McpReply[]) =>
    ((replies[1]?.result?.tools ?? []) as { name: string }[]).map((t) => t.name);
  expect(live[0]?.result?.serverInfo).toMatchObject({ name: 'mesa-vault' });
  expect(tools(live)).toContain('save_decision');
  expect(tools(none)).toEqual([]);
  expect(tools(stopped)).toEqual([]);
  expect(tools(other)).toEqual([]);
  expect(logged.join('')).toContain('MESA_SESSION_ID is not set: this is not a Mesa session');
  expect(logged.join('')).toContain(`session ${id} is profile work's, not default's`);

  // No Decision model: mesa-decisions answers, inert, with no tools.
  const decisions = await connection(
    path,
    { server: 'decisions', session: id, profile: 'default' },
    ...list,
  );
  expect(decisions[0]?.result?.serverInfo).toMatchObject({ name: 'mesa-decisions' });
  expect(tools(decisions)).toEqual([]);

  vi.advanceTimersByTime(10 * 60_000);
  await served;
  expect(existsSync(path)).toBe(false);
});

test("a session's start starts the profile's Shared MCP server from tmux, unless one answers", async () => {
  const world = cli.withTmux();
  await cli.withProject();
  await cli.mesa('open', 'lantern-cove');
  expect(world.ranLater).toEqual([
    "sleep 0; '/usr/local/bin/mesa' --profile 'default' mcp serve >/dev/null 2>&1 || :",
  ]);
  // An Antigravity session reads its global entry, so it starts nothing.
  expect((await cli.mesa('open', 'lantern-cove', '--agent', 'antigravity')).code).toBe(0);
  expect(world.ranLater).toHaveLength(1);
});

test('mesa serve refuses mcp serve, which serves its own socket', async () => {
  const replies: string[] = [];
  const started = await cli.mesa('serve');
  await started.serve?.({
    lines: (async function* () {
      yield JSON.stringify({ id: 1, args: ['mcp', 'serve'] });
    })(),
    write: (text) => replies.push(text),
    log: () => {},
  });
  expect(JSON.parse(replies[0] ?? '')).toMatchObject({
    code: 2,
    stderr: 'mesa serve: mcp serve serves its own stdio; run it as its own process\n',
  });
});
