import { CLAUDE_VERSION, CODEX_VERSION, fakeTmux, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

/** A tmux server in memory, with claude and codex installed. */
function withAgents() {
  const world = fakeTmux();
  cli.run = scriptedRunner({
    tmux: world.answer,
    claude: CLAUDE_VERSION,
    codex: CODEX_VERSION,
  }).run;
  return world;
}

test('swap restarts a fresh session in place on another agent, in a new window', async () => {
  const world = withAgents();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  const swapped = await mesa('swap', opened.id, 'codex', '--json');
  expect(swapped.code, swapped.stdout).toBe(0);
  expect(swapped.json.data).toMatchObject({
    id: opened.id,
    agent: 'codex',
    tmux: { window: `codex-${opened.id}` },
  });
  // Codex picks its own thread id; the claude one is gone.
  expect(swapped.json.data.agentSessionId).toBeUndefined();
  const live = world.windows.filter((w) => w.project === 'lantern-cove').map((w) => w.window);
  expect(live).toEqual([`codex-${opened.id}`]);
  expect(world.windows.find((w) => w.window === `codex-${opened.id}`)?.launch).toContain('codex');
  // The old window's death is no session's: the session stays live, on the board.
  const [row] = (await mesa('sessions', '--json')).json.data;
  expect(row).toMatchObject({ id: opened.id, agent: 'codex', alive: true });
  expect((await mesa('swap', opened.id, 'codex')).stderr).toContain('already runs codex');
});

test('swap refuses a session with a conversation, a terminal, and an agent it cannot run', async () => {
  withAgents();
  await cli.withProject();
  const goaled = (await mesa('open', 'lantern-cove', '--no-parent', '--goal', 'Say hi', '--json'))
    .json.data;
  const refused = await mesa('swap', goaled.id, 'codex', '--json');
  expect(refused.code).toBe(2);
  expect(refused.json.error.message).toBe(
    `session ${goaled.id} has a conversation, which codex cannot carry on: mesa handoff ${goaled.id} --agent codex --note <file>`,
  );
  const terminal = (await mesa('open', 'lantern-cove', '--terminal', '--no-parent', '--json')).json
    .data;
  expect((await mesa('swap', terminal.id, 'codex', '--json')).json.error.message).toBe(
    `session ${terminal.id} is a terminal; only an agent session swaps`,
  );
  const fresh = (await mesa('open', 'lantern-cove', '--no-parent', '--json')).json.data;
  expect((await mesa('swap', fresh.id, 'gemini', '--json')).json.error.code).toBe(
    'agent_unavailable',
  );
  // Refused, it is untouched.
  expect((await mesa('show', fresh.id, '--json')).json.data).toMatchObject({ agent: 'claude' });
});
