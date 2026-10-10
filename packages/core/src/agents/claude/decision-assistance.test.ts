import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { PER_TURN_MS } from '../../decisions/models.js';
import { decisionStatus } from '../../sessions/native/decision-status.js';
import { instructionStatus } from '../../sessions/native/instructions.js';
import { goalPreparing, sessionWindowCommand } from '../../sessions/start/window-command.js';
import {
  ADVICE_MARKER,
  assistedAgent,
  MARKED_NOTE,
  NATIVE_LAUNCH as NATIVE,
} from '../../testing/index.js';
import { AGENTS } from '../agents.js';
import { launchMounts } from '../mesa-mount.js';
import { claudeSettings } from './paths.js';

// Claude Code's decision assistance (#463, ADR-0019): mesa-decisions mounted per launch beside
// mesa-vault while there is a Decision model, and a turn's advice as UserPromptSubmit
// additionalContext, the event the #459 probe proved, for the native conversation Mesa holds only.

const SELF = ['/opt/node', '/src/mesa.js'];
const ID = '360ed2a1-f255-4c2a-8f30-ba7b6ea349f5';
const NATIVE_ID = '7d1e5a52-0b8c-4c43-9b7e-2f6a1c3d9e10';
// The mesa testDeps runs as, which its hooks and mounts name.
const MESA = ['/usr/local/bin/mesa'];
const BOTH = `'--mcp-config={"mcpServers":{"mesa-vault":{"type":"stdio","command":"/opt/node","args":["/src/mesa.js","vault","mcp"]},"mesa-decisions":{"type":"stdio","command":"/opt/node","args":["/src/mesa.js","decisions","mcp"]}}}' '--allowedTools=mcp__mesa-vault,mcp__mesa-decisions'`;
const prompt = (session_id: string, extra: object = {}) =>
  JSON.stringify({
    session_id,
    hook_event_name: 'UserPromptSubmit',
    prompt: 'Make the feed import retry on 503',
    ...extra,
  });
const contextOf = (advice: string) => JSON.parse(advice).hookSpecificOutput;

test('mesa-decisions is mounted and pre-approved beside mesa-vault only with a Decision model', () => {
  const on = launchMounts(SELF, { decisions: true });
  // The goal stays the prompt, after the `=` forms; no --strict-mcp-config drops the user's servers.
  expect(AGENTS.claude.start(ID, on, NATIVE, 'Map the tides')).toBe(
    `claude --session-id ${ID} ${BOTH} 'Map the tides'`,
  );
  expect(AGENTS.claude.resume(ID, '/src', on, NATIVE)).toBe(`claude --resume ${ID} ${BOTH}`);
  expect(
    AGENTS.claude.headless.command(
      ID,
      '/tide',
      { permissionMode: 'default', allowedTools: ['Read'] },
      '/src',
      on,
    ),
  ).toMatch(/--allowedTools 'mcp__mesa-vault' 'mcp__mesa-decisions' 'Read'$/);
  const off = AGENTS.claude.start(
    ID,
    launchMounts(SELF, { decisions: false }),
    NATIVE,
    'Map the tides',
  );
  expect(off).not.toContain('mesa-decisions');
  expect(off).not.toContain('strict-mcp-config');
});

test("the window asks for the goal's answer in the background while claude starts", () => {
  const deps = { mounts: launchMounts(SELF, { decisions: true }), self: SELF };
  const command = AGENTS.claude.start(ID, deps.mounts, NATIVE, 'Map the tides');
  expect(
    sessionWindowCommand(
      'claude',
      'interactive',
      command,
      goalPreparing(deps, 'interactive', 'Map the tides'),
    ),
  ).toBe(
    `('/opt/node' '/src/mesa.js' decisions prepare >/dev/null 2>&1 &); unset NO_COLOR; exec ${command}`,
  );
  // No goal, no model, or a skill run: nothing in the background.
  expect(goalPreparing(deps, 'interactive')).toBe('');
  expect(
    goalPreparing(
      { ...deps, mounts: launchMounts(SELF, { decisions: false }) },
      'interactive',
      'g',
    ),
  ).toBe('');
  expect(goalPreparing(deps, 'run', 'g')).toBe('');
});

test("a prompt of the session's own conversation gets the source the model is sure of as additionalContext", async () => {
  const { mesa, session, world, home } = await assistedAgent('claude', NATIVE_ID);
  const event = await mesa.hookEvent('claude', prompt(NATIVE_ID));
  if (!event || !('advice' in event) || !event.advice) throw new Error('no advice');
  const output = contextOf(event.advice);
  expect(output.hookEventName).toBe('UserPromptSubmit');
  expect(output.additionalContext).toContain(`note:${MARKED_NOTE}`);
  expect(output.additionalContext).toContain(ADVICE_MARKER);
  expect(output.additionalContext).toContain('advice only, it never acts');
  expect(output.additionalContext.length).toBeLessThanOrEqual(700);
  expect(world.requests).toHaveLength(1);
  // The same prompt again reads the ready answer: no second call.
  await mesa.hookEvent('claude', prompt(NATIVE_ID));
  expect(world.requests).toHaveLength(1);
  // Observed beside configured: the advice was sent; the tool not yet called. Its hooks are not
  // installed in this home, so advice is not configured for the next turn.
  const status = decisionStatus(session, mesa.decisions.assistState(session), {
    home,
    env: {},
    self: MESA,
  });
  expect(status.tool).toEqual({
    state: 'configured',
    reason: 'mesa-decisions is mounted in its launch command',
  });
  expect(status.advice).toMatchObject({ state: 'missing', observedAt: '2026-09-24T12:00:00.000Z' });
});

test('a nested conversation, a subagent, an ended or turned-off session get no advice and no call', async () => {
  const { mesa, world } = await assistedAgent('claude', NATIVE_ID);
  // A claude started inside the session's claude inherits its window; its conversation is not ours.
  expect(await mesa.hookEvent('claude', prompt('another-conversation'))).toBeUndefined();
  const sub = await mesa.hookEvent('claude', prompt(NATIVE_ID, { agent_id: 'sub-1' }));
  expect(sub && 'advice' in sub).toBe(false);
  mesa.decisions.setOff(true);
  const off = await mesa.hookEvent('claude', prompt(NATIVE_ID));
  expect(off && 'advice' in off).toBe(false);
  expect(world.requests).toEqual([]);
});

test('an abstaining, failing or slow model skips advice, well inside the native 5 s timeout', async () => {
  const { mesa, world } = await assistedAgent('claude', NATIVE_ID);
  world.lean({ p: 0.55 });
  // Each prompt shares "feed" and "retry" with the note, so each asks the model.
  const unsure = await mesa.hookEvent('claude', prompt(NATIVE_ID, { prompt: 'feed retry, first' }));
  expect(unsure && 'advice' in unsure).toBe(false);
  world.lean();
  world.refuse('jev', 503);
  const failed = await mesa.hookEvent(
    'claude',
    prompt(NATIVE_ID, { prompt: 'feed retry, second' }),
  );
  expect(failed && 'advice' in failed).toBe(false);
  world.refuse('jev');
  world.stall('jev');
  const started = Date.now();
  const slow = await mesa.hookEvent('claude', prompt(NATIVE_ID, { prompt: 'feed retry, third' }));
  expect(slow && 'advice' in slow).toBe(false);
  // The per-turn deadline (3,000 ms in all, ADR-0019) ends the call, far inside the native 5 s;
  // the slack is this test's own process, not the hook's budget.
  expect(Date.now() - started).toBeLessThan(PER_TURN_MS + 250);
  expect(world.aborted).toHaveLength(1);
}, 10_000);

test('the live ask gets only what the per-turn budget leaves after the vault read', async () => {
  // A clock that runs a third of the budget on every reading: by the ask, the budget is spent.
  let now = Date.parse('2026-09-24T12:00:00.000Z');
  const clock = () => {
    now += PER_TURN_MS / 3;
    return new Date(now);
  };
  const { mesa, world } = await assistedAgent('claude', NATIVE_ID, { deps: { clock } });
  world.stall('jev');
  const started = Date.now();
  const event = await mesa.hookEvent('claude', prompt(NATIVE_ID));
  expect(event && 'advice' in event).toBe(false);
  // Asked with nothing left, the stalled call ends at once instead of waiting 3,000 ms more.
  expect(Date.now() - started).toBeLessThan(PER_TURN_MS / 2);
  expect(world.aborted).toHaveLength(1);
});

test("the hook process's own start-up counts against the per-turn budget", async () => {
  const now = Date.parse('2026-09-24T12:00:00.000Z');
  const clock = () => new Date(now);
  // The process started 1,450 ms before the advice is asked for: 50 ms are left.
  const processStartedAt = new Date(now - 1_450);
  const { mesa, world } = await assistedAgent('claude', NATIVE_ID, {
    deps: { clock, processStartedAt },
  });
  world.stall('jev');
  const started = Date.now();
  const event = await mesa.hookEvent('claude', prompt(NATIVE_ID));
  expect(event && 'advice' in event).toBe(false);
  expect(Date.now() - started).toBeLessThan(PER_TURN_MS / 2);
  expect(world.aborted).toHaveLength(1);
});

test("the goal's answer prepared at launch is its first turn's ready answer", async () => {
  const { mesa, session, world } = await assistedAgent('claude', NATIVE_ID);
  expect(await mesa.decisions.prepare()).toMatchObject({ session: session.id, prepared: true });
  expect(world.requests).toHaveLength(1);
  const event = await mesa.hookEvent('claude', prompt(NATIVE_ID, { prompt: session.goal }));
  expect(event && 'advice' in event && contextOf(event.advice).additionalContext).toContain(
    ADVICE_MARKER,
  );
  expect(world.requests).toHaveLength(1);
});

test("SessionStart's pointer names the decision tool only while the session has it", async () => {
  const { mesa, session, person } = await assistedAgent('claude', NATIVE_ID);
  const start = JSON.stringify({ session_id: NATIVE_ID, hook_event_name: 'SessionStart' });
  const pointer = async () => {
    const event = await mesa.hookEvent('claude', start);
    return event && 'instruction' in event ? event.instruction : '';
  };
  expect(await pointer()).toContain("Decisions: mesa-decisions' decision_evaluate");
  mesa.decisions.setOff(true);
  expect(await pointer()).not.toContain('Decisions:');
  mesa.decisions.setOff(false);
  await person.decisions.use('none');
  expect(await pointer()).not.toContain('Decisions:');
  expect(session.decisionsMounted).toBe(true);
});

test("SessionStart's pointer names the CLI while the model is chosen but the tool is not mounted", async () => {
  const { mesa } = await assistedAgent('claude', NATIVE_ID, {
    session: { decisionsMounted: undefined },
  });
  const start = JSON.stringify({ session_id: NATIVE_ID, hook_event_name: 'SessionStart' });
  const event = await mesa.hookEvent('claude', start);
  const pointer = event && 'instruction' in event ? event.instruction : '';
  expect(pointer).toContain(
    'Decisions: no mesa-decisions tool here; mesa decisions evaluate --json',
  );
  expect(pointer).not.toContain('decision_evaluate');
});

test('installed hooks pass UserPromptSubmit output to Claude, and advice is then configured', async () => {
  const { mesa, session, home } = await assistedAgent('claude', NATIVE_ID);
  mesa.hooks.install();
  const settings = JSON.parse(readFileSync(claudeSettings(home, {}), 'utf8'));
  expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
    `[ -z "$MESA_SESSION_ID" ] || '/usr/local/bin/mesa' hook claude 2>/dev/null || true`,
  );
  expect(
    decisionStatus(session, mesa.decisions.assistState(session), { home, env: {}, self: MESA })
      .advice,
  ).toEqual({ state: 'configured', reason: 'UserPromptSubmit adds advice to the turn' });
});

test('hooks Mesa installed with SessionStart but no UserPromptSubmit read as stale, not missing (#678)', async () => {
  const { mesa, session, home } = await assistedAgent('claude', NATIVE_ID);
  mesa.hooks.install();
  // An install from before Mesa hooked UserPromptSubmit: an update adds it.
  const path = claudeSettings(home, {});
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  delete settings.hooks.UserPromptSubmit;
  writeFileSync(path, JSON.stringify(settings));
  const stale = { state: 'conflicting', reason: 'Mesa hooks are stale; run mesa hooks install' };
  expect(
    decisionStatus(session, mesa.decisions.assistState(session), { home, env: {}, self: MESA })
      .advice,
  ).toEqual(stale);
  expect(instructionStatus('claude', home, {}, MESA)).toEqual(stale);
  expect((await mesa.hooks.status()).needsUpdate).toBe(true);
});
