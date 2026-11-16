import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from 'vitest';
import { decisionStatus } from '../../sessions/native/decision-status.js';
import { ADVICE_MARKER, assistedAgent, NATIVE_LAUNCH } from '../../testing/index.js';
import { AGENTS } from '../agents.js';
import { antigravityCliSettings, antigravityMcpConfig } from './paths.js';

// Antigravity's decision assistance (#463, ADR-0019): `mesa decisions evaluate`, through the mesa
// skill, with the global MCP entries Mesa once wrote removed by install (ADR-0031); its
// PreInvocation hook, which carries no prompt and runs before every model call, re-sends the
// pointer and the saved goal's ready advice unchanged, and never asks a model itself.

const CONVERSATION = '002f58d1-9e29-4682-9bc1-3a2dc5da1115';
const MESA = ['/usr/local/bin/mesa'];
const invocation = (n: number, conversationId = CONVERSATION) =>
  JSON.stringify({ conversationId, invocationNum: n, initialNumSteps: 4 });

test("install removes Mesa's old entries and rules, and only Mesa's", async () => {
  const { mesa, home } = await assistedAgent('antigravity', CONVERSATION);
  const mcpFile = antigravityMcpConfig(home);
  const rulesFile = antigravityCliSettings(home);
  const tide = { command: 'node', args: ['/opt/tide.js'] };
  const old = (args: string[]) => ({ command: '/usr/local/bin/mesa', args });
  const write = (file: string, value: object) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  };
  write(mcpFile, {
    mcpServers: {
      tide,
      'mesa-vault': old(['vault', 'mcp']),
      'mesa-decisions': old(['decisions', 'mcp']),
    },
  });
  write(rulesFile, {
    permissions: { allow: ['command(git)', 'mcp(mesa-vault/*)', 'mcp(mesa-decisions/*)'] },
  });
  expect((await mesa.hooks.status()).antigravityMounts.left).toBe(true);
  expect(mesa.hooks.install().result.antigravityMounts).toMatchObject({
    left: false,
    changed: true,
  });
  expect(JSON.parse(readFileSync(mcpFile, 'utf8'))).toEqual({ mcpServers: { tide } });
  expect(JSON.parse(readFileSync(rulesFile, 'utf8'))).toEqual({
    permissions: { allow: ['command(git)'] },
  });
  expect(mesa.hooks.install().result.antigravityMounts.changed).toBe(false);
  // A server of the user's under one of Mesa's names is never taken.
  const theirs = {
    mcpServers: { 'mesa-decisions': { command: 'node', args: ['/opt/advisor.js'] } },
  };
  write(mcpFile, theirs);
  expect(mesa.hooks.install().result.antigravityMounts.conflict).toContain(
    'mesa-decisions belongs to another server',
  );
  expect(JSON.parse(readFileSync(mcpFile, 'utf8'))).toEqual(theirs);
});

test('the pointer names mesa decisions evaluate, with no tool to mount', async () => {
  const { mesa } = await assistedAgent('antigravity', CONVERSATION);
  const pointer = await mesa.antigravityInstruction(invocation(0));
  expect(pointer).toContain('Decisions: mesa decisions evaluate --json');
  expect(pointer).not.toContain('decision_evaluate');
});

test("PreInvocation re-sends the pointer and the goal's ready advice unchanged, asking no model", async () => {
  const { mesa, world } = await assistedAgent('antigravity', CONVERSATION);
  mesa.hooks.install();
  // No ready answer yet: the pointer, naming the command, and no call from the hook.
  const before = await mesa.antigravityInstruction(invocation(0));
  expect(before).toContain('Decisions: mesa decisions evaluate --json');
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

test('its status: the command configured, and advice unsupported without a saved goal', async () => {
  const { mesa, session, home, plant } = await assistedAgent('antigravity', CONVERSATION);
  const host = { home, env: {}, self: MESA };
  const status = (record = session) =>
    decisionStatus(record, mesa.decisions.assistState(record), host);
  const tool = { state: 'configured', reason: 'mesa decisions evaluate, through the mesa skill' };
  expect(status()).toEqual({
    tool,
    advice: { state: 'missing', reason: 'Run mesa hooks install' },
  });
  mesa.hooks.install();
  expect(status()).toEqual({
    tool,
    advice: { state: 'configured', reason: "PreInvocation re-sends the goal's ready advice" },
  });
  const goalless = plant({ agent: 'antigravity', agentSessionId: CONVERSATION });
  expect(status(goalless).advice).toEqual({
    state: 'unsupported',
    reason: 'Antigravity hooks carry no prompt; it needs a saved goal',
  });
  // A skill run's window asks nothing in the background, agy's only source of advice.
  const run = plant({
    agent: 'antigravity',
    agentSessionId: CONVERSATION,
    kind: 'run',
    goal: '/feed-check feed retry policy',
  });
  expect(status(run).advice).toEqual({
    state: 'unsupported',
    reason:
      "Antigravity's advice is the goal's answer asked as its window starts; a skill run asks none",
  });
  // agy's argv takes no mount: its start command names none.
  expect(AGENTS.antigravity.start('g', '/tmp/x.log', NATIVE_LAUNCH)).not.toContain(
    'mesa-decisions',
  );
});
