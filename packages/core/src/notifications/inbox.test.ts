import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { setConfigValue } from '../profile/config.js';
import { eventsLog, recordHookEvent } from '../sessions/hook-events.js';
import {
  newSession,
  profilePaths,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';

test('inbox deduplicates a question pair, keeps child alerts separate, and survives restart', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const store = testStore(home);
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const session = store.create(() => newSession({ agentSessionId: nativeId }));
  let second = 0;
  const deps = {
    store,
    eventsDir: profilePaths(home, 'default').events,
    clock: () => new Date(`2026-09-24T12:00:${String(second++).padStart(2, '0')}.000Z`),
    home,
    secrets: () => [],
  };
  const hook = (event: string, extra: Record<string, unknown> = {}) =>
    recordHookEvent(deps, {
      agent: 'claude',
      mesaSessionId: session.id,
      payload: JSON.stringify({ session_id: nativeId, hook_event_name: event, ...extra }),
    });
  hook('PreToolUse', { tool_name: 'AskUserQuestion', tool_input: { question: 'Choose' } });
  hook('PermissionRequest', { tool_name: 'AskUserQuestion', tool_input: { question: 'Choose' } });
  hook('PermissionRequest', { agent_id: 'agent-lantern', tool_name: 'Bash' });
  hook('Stop');

  const first = mesa.notifications.list();
  expect(first.map((item) => item.kind)).toEqual(['finished', 'subagent', 'input-required']);
  expect(
    first.every(
      (item) => item.target.kind === 'session' && item.target.id === session.id && !item.read,
    ),
  ).toBe(true);
  const firstId = first[0]?.id;
  if (!firstId) throw new Error('expected a finished inbox item');
  mesa.notifications.markRead(firstId);
  const restarted = createMesa('default', testDeps(home));
  expect(restarted.notifications.list()[0]).toMatchObject({ id: firstId, read: true });
  restarted.notifications.clear(firstId);
  expect(restarted.notifications.list()).toHaveLength(2);
  expect(createMesa('other', testDeps(home)).notifications.list()).toEqual([]);
});

test('Doctor findings enter the inbox once, resolve on recheck, and target Doctor', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const report = (status: 'warn' | 'ok') => ({
    healthy: true,
    summary: '',
    checks: [
      { name: 'claude hooks', ok: status === 'ok', status, hint: 'Install hooks' },
      { name: 'codex hooks', ok: status === 'ok', status, hint: 'Review hooks' },
    ],
  });
  mesa.notifications.recordDoctor(report('warn'));
  const plan = mesa.notifications.delivery();
  expect(plan).toMatchObject({ kind: 'notice', target: { kind: 'doctor' } });
  if (plan.kind === 'none') throw new Error('expected Doctor notice');
  mesa.notifications.markDelivered(plan.ids);
  const [finding] = mesa.notifications.list();
  expect(finding).toMatchObject({
    kind: 'doctor',
    title: 'Doctor: 2 findings',
    target: { kind: 'doctor' },
  });
  expect(mesa.notifications.list()).toHaveLength(1);
  expect(createMesa('default', testDeps(home)).notifications.list()[0]?.id).toBe(finding?.id);
  expect(createMesa('default', testDeps(home)).notifications.delivery()).toEqual({ kind: 'none' });
  expect(createMesa('other', testDeps(home)).notifications.list()).toEqual([]);
  mesa.notifications.recordDoctor(report('ok'));
  expect(mesa.notifications.list()).toEqual([]);
});

test('quiet delivery digests new notices once and respects each kind across restarts', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const paths = profilePaths(home, 'default');
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const session = testStore(home).create(() => newSession({ agentSessionId: nativeId }));
  let second = 1;
  const hook = (event: string, extra: Record<string, unknown> = {}) =>
    recordHookEvent(
      {
        store: testStore(home),
        eventsDir: paths.events,
        clock: () => new Date(`2026-09-24T12:00:0${second++}.000Z`),
        home,
        secrets: () => [],
      },
      {
        agent: 'claude',
        mesaSessionId: session.id,
        payload: JSON.stringify({ session_id: nativeId, hook_event_name: event, ...extra }),
      },
    );
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  hook('Stop');
  hook('PermissionRequest', { tool_name: 'Bash' });
  setConfigValue(paths.config, 'notifications.quiet', 'true');
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  setConfigValue(paths.config, 'notifications.quiet', 'false');
  const plan = mesa.notifications.delivery();
  expect(plan).toMatchObject({ kind: 'digest', title: '2 Mesa notices', sound: true });
  if (plan.kind === 'none') throw new Error('expected digest');
  mesa.notifications.markDelivered(plan.ids);
  expect(createMesa('default', testDeps(home)).notifications.delivery()).toEqual({ kind: 'none' });

  setConfigValue(paths.config, 'notifications.finished', 'off');
  hook('Stop');
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  setConfigValue(paths.config, 'notifications.finished', 'sound');
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
});

test('inbox reads a bounded hook tail while retaining the newest notice', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const session = testStore(home).create(() => newSession());
  const file = eventsLog(profilePaths(home, 'default').events, session.id);
  mkdirSync(dirname(file), { recursive: true });
  const event = (at: string, name: string, payload: object = {}) =>
    `${JSON.stringify({ at, agent: 'claude', event: name, payload })}\n`;
  appendFileSync(file, event('2026-09-24T12:00:00.000Z', 'Stop'));
  appendFileSync(
    file,
    event('2026-09-24T12:00:01.000Z', 'PostToolUse', { filler: 'x'.repeat(128 * 1024) }),
  );
  appendFileSync(file, event('2026-09-24T12:00:02.000Z', 'Stop'));
  expect(mesa.notifications.list().map((item) => item.at)).toEqual(['2026-09-24T12:00:02.000Z']);
});
