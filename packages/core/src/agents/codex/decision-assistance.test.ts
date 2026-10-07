import { realpathSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decisionStatus } from '../../sessions/native/decision-status.js';
import { ADVICE_MARKER, assistedAgent, NATIVE_LAUNCH as NATIVE } from '../../testing/index.js';
import { AGENTS } from '../agents.js';
import { launchMounts } from '../vault-mount.js';
import { codexConfig, codexHome } from './paths.js';

// Codex's decision assistance (#463, ADR-0019): mesa-decisions mounted per launch with the same
// four overrides as mesa-vault, and a turn's advice as UserPromptSubmit additionalContext (a
// developer message, proven by #459), only once the person trusted Mesa's hook in Codex.

const SELF = ['/opt/node', '/src/mesa.js'];
const MESA = ['/usr/local/bin/mesa'];
const THREAD = '11111111-2222-4333-8444-555555555555';
const DECISIONS = [
  `-c 'mcp_servers.mesa-decisions.command="/opt/node"'`,
  `-c 'mcp_servers.mesa-decisions.args=["/src/mesa.js","decisions","mcp"]'`,
  `-c 'mcp_servers.mesa-decisions.env_vars=["MESA_SESSION_ID","MESA_PROFILE"]'`,
  `-c 'mcp_servers.mesa-decisions.default_tools_approval_mode="approve"'`,
].join(' ');
const prompt = (session_id: string, text = 'Make the feed import retry on 503') =>
  JSON.stringify({
    session_id,
    turn_id: '22222222-3333-4444-8555-666666666666',
    hook_event_name: 'UserPromptSubmit',
    prompt: text,
  });

test('mesa-decisions is mounted on start, resume, fork and exec only with a Decision model', () => {
  const on = launchMounts(SELF, true);
  // After mesa-vault's four overrides; the goal stays a prompt after --.
  expect(AGENTS.codex.start(on, NATIVE, 'review')).toMatch(
    new RegExp(`approve"' ${DECISIONS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} -- 'review'$`),
  );
  for (const command of [
    AGENTS.codex.resume(THREAD, '/src', on, NATIVE),
    AGENTS.codex.fork(THREAD, '/src', on, NATIVE),
    AGENTS.codex.headless.command(
      undefined,
      '$tide',
      { permissionMode: 'default', allowedTools: [] },
      '/src',
      on,
    ),
  ])
    expect(command).toContain(DECISIONS);
  expect(AGENTS.codex.start(launchMounts(SELF, false), NATIVE, 'review')).not.toContain(
    'mesa-decisions',
  );
});

test('a prompt of its own thread gets advice; a nested Codex thread in the same window gets none', async () => {
  const { mesa, world } = await assistedAgent('codex', THREAD);
  const event = await mesa.hookEvent('codex', prompt(THREAD));
  if (!event || !('advice' in event) || !event.advice) throw new Error('no advice');
  expect(JSON.parse(event.advice).hookSpecificOutput).toMatchObject({
    hookEventName: 'UserPromptSubmit',
    additionalContext: expect.stringContaining(ADVICE_MARKER),
  });
  // A codex started inside it inherits the window, under its own thread id: not ours.
  expect(
    await mesa.hookEvent('codex', prompt('99999999-2222-4333-8444-555555555555')),
  ).toBeUndefined();
  expect(world.requests).toHaveLength(1);
});

test("advice is configured only once the person trusted Mesa's UserPromptSubmit hook in Codex", async () => {
  const { mesa, session, home } = await assistedAgent('codex', THREAD);
  const host = { home, env: {}, self: MESA };
  const advice = () => decisionStatus(session, mesa.decisions.assistState(session), host).advice;
  expect(advice()).toEqual({ state: 'missing', reason: 'Run mesa hooks install' });
  const installed = mesa.hooks.install().result;
  expect(installed.codex.trusted.UserPromptSubmit).toBe(false);
  // Mesa never writes Codex's trust; until the person reviews the hook, it stays untrusted.
  expect(advice()).toEqual({
    state: 'conflicting',
    reason: 'Review and trust the Mesa hook in Codex',
  });
  // The person's review, as Codex records it for the hook's canonical source and position.
  const source = JSON.stringify(`${realpathSync(installed.codex.path)}:user_prompt_submit:0:0`);
  writeFileSync(
    codexConfig(codexHome(home, {})),
    `[hooks.state.${source}]\ntrusted_hash = "sha256:invented"\n`,
  );
  expect(advice()).toEqual({
    state: 'configured',
    reason: 'UserPromptSubmit adds advice to the turn',
  });
});
