import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from 'vitest';
import { decisionStatus } from '../../sessions/native/decision-status.js';
import { ADVICE_MARKER, assistedAgent, NATIVE_LAUNCH } from '../../testing/index.js';
import { AGENTS } from '../agents.js';
import { antigravityCliSettings, antigravityMcpConfig } from './paths.js';

// Antigravity's decision assistance (#463, ADR-0019): agy takes no MCP server per launch, so
// mesa-decisions is a global entry and allow rule beside mesa-vault's, owned as theirs are; its
// PreInvocation hook, which carries no prompt and runs before every model call, re-sends the
// pointer and the saved goal's ready advice unchanged, and never asks a model itself.

const CONVERSATION = '002f58d1-9e29-4682-9bc1-3a2dc5da1115';
const MESA = ['/usr/local/bin/mesa'];
const invocation = (n: number, conversationId = CONVERSATION) =>
  JSON.stringify({ conversationId, invocationNum: n, initialNumSteps: 4 });

test("install adds Mesa's two entries and rules beside the user's; uninstall removes only Mesa's", async () => {
  const { mesa, home } = await assistedAgent('antigravity', CONVERSATION);
  const mcpFile = antigravityMcpConfig(home);
  const rulesFile = antigravityCliSettings(home);
  const mcp = `${JSON.stringify({ mcpServers: { tide: { command: 'node', args: ['/opt/tide.js'] } } }, null, 2)}\n`;
  const rules = `${JSON.stringify({ permissions: { allow: ['command(git)'] } }, null, 2)}\n`;
  for (const [file, text] of [
    [mcpFile, mcp],
    [rulesFile, rules],
  ] as const) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const installed = mesa.hooks.install().result;
  expect(installed.antigravityDecisions).toMatchObject({ installed: true, changed: true });
  expect(JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers['mesa-decisions']).toEqual({
    command: '/usr/local/bin/mesa',
    args: ['decisions', 'mcp'],
  });
  expect(JSON.parse(readFileSync(rulesFile, 'utf8')).permissions.allow).toEqual([
    'command(git)',
    'mcp(mesa-vault/*)',
    'mcp(mesa-decisions/*)',
  ]);
  expect(mesa.hooks.install().result.changed).toBe(false);
  mesa.hooks.uninstall();
  expect(readFileSync(mcpFile, 'utf8')).toBe(mcp);
  expect(readFileSync(rulesFile, 'utf8')).toBe(rules);
});

test("PreInvocation re-sends the pointer and the goal's ready advice unchanged, asking no model", async () => {
  const { mesa, world } = await assistedAgent('antigravity', CONVERSATION);
  mesa.hooks.install();
  // No ready answer yet: the pointer, naming the tool, and no call from the hook.
  const before = await mesa.antigravityInstruction(invocation(0));
  expect(before).toContain("Decisions: mesa-decisions' decision_evaluate");
  expect(before).not.toContain(ADVICE_MARKER);
  expect(world.requests).toEqual([]);
  // The window's background ask readies the goal's answer as agy starts.
  await mesa.decisions.prepare();
  expect(world.requests).toHaveLength(1);
  const first = await mesa.antigravityInstruction(invocation(1));
  expect(first).toContain(ADVICE_MARKER);
  // A tool call's next model call in the same turn gets the same words again.
  expect(await mesa.antigravityInstruction(invocation(2))).toBe(first);
  expect(world.requests).toHaveLength(1);
  // Another conversation in the window is not the one Mesa holds.
  expect(
    await mesa.antigravityInstruction(invocation(0, 'cd66cf01-f466-4c11-8f12-a8fd0885d9f4')),
  ).toBeUndefined();
  mesa.decisions.setOff(true);
  expect(await mesa.antigravityInstruction(invocation(3))).not.toContain(ADVICE_MARKER);
});

test('its status: configured from the global entries, and advice unsupported without a saved goal', async () => {
  const { mesa, session, home, plant } = await assistedAgent('antigravity', CONVERSATION);
  const host = { home, env: {}, self: MESA };
  const status = (record = session) =>
    decisionStatus(record, mesa.decisions.assistState(record), host);
  // A model and no entry (chosen after the last install): show names the install that adds it.
  expect(status()).toEqual({
    tool: {
      state: 'missing',
      reason: 'No global mesa-decisions entry; run mesa hooks install',
      action: 'hooks install',
    },
    advice: { state: 'missing', reason: 'Run mesa hooks install' },
  });
  mesa.hooks.install();
  expect(status()).toEqual({
    tool: { state: 'configured', reason: 'Global mesa-decisions entry and allow rule' },
    advice: { state: 'configured', reason: "PreInvocation re-sends the goal's ready advice" },
  });
  const goalless = plant({ agent: 'antigravity', agentSessionId: CONVERSATION });
  expect(status(goalless).advice).toEqual({
    state: 'unsupported',
    reason: 'Antigravity hooks carry no prompt; it needs a saved goal',
  });
  // agy's argv takes no mount: its start command names none.
  expect(AGENTS.antigravity.start('g', '/tmp/x.log', NATIVE_LAUNCH)).not.toContain(
    'mesa-decisions',
  );
});

test("with no Decision model install writes no mesa-decisions entry, and takes Mesa's own away", async () => {
  const { mesa, person, home } = await assistedAgent('antigravity', CONVERSATION);
  const mcpFile = antigravityMcpConfig(home);
  const rulesFile = antigravityCliSettings(home);
  const servers = () => Object.keys(JSON.parse(readFileSync(mcpFile, 'utf8')).mcpServers);
  const rules = () => JSON.parse(readFileSync(rulesFile, 'utf8')).permissions.allow;
  mesa.hooks.install();
  expect(servers()).toEqual(['mesa-vault', 'mesa-decisions']);
  await person.decisions.use('none');
  const installed = mesa.hooks.install().result;
  expect(installed.antigravityDecisions).toMatchObject({ installed: false, wanted: false });
  expect(servers()).toEqual(['mesa-vault']);
  expect(rules()).toEqual(['mcp(mesa-vault/*)']);
  expect((await mesa.hooks.status()).antigravityDecisions).toMatchObject({
    server: false,
    rule: false,
    wanted: false,
  });
  // A server of the user's under that name is never taken, with a model or without one.
  const theirs = `${JSON.stringify({ mcpServers: { 'mesa-decisions': { command: 'node', args: ['/opt/advisor.js'] } } })}\n`;
  writeFileSync(mcpFile, theirs);
  expect(mesa.hooks.install().result.antigravityDecisions.conflict).toContain(
    'mesa-decisions belongs to another server',
  );
  expect(readFileSync(mcpFile, 'utf8')).toBe(theirs);
});
