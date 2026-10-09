import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from 'vitest';
import { HOOKS_UPDATE_HINT } from '../agents/hooks-update.js';
import { automationState } from '../automations/state.js';
import { createMesa } from '../mesa.js';
import { setConfigValue } from '../profile/config.js';
import { eventsLog, recordHookEvent } from '../sessions/signals/hook-events.js';
import {
  lockDeps,
  newSession,
  profilePaths,
  projectProfile,
  scriptedRunner,
  testDeps,
  testStore,
} from '../testing/index.js';

test('a session keeps only its newest notice, a subagent finishing raises none, and marks survive restart', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const store = testStore(home);
  const nativeId = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
  const session = store.create(() => newSession({ agentSessionId: nativeId }));
  const other = store.create(() => newSession());
  let second = 0;
  const deps = {
    store,
    eventsDir: profilePaths(home, 'default').events,
    clock: () => new Date(`2026-09-24T12:00:${String(second++).padStart(2, '0')}.000Z`),
    home,
    secrets: () => [],
  };
  const hook = (event: string, extra: Record<string, unknown> = {}, id = session.id) =>
    recordHookEvent(deps, {
      agent: 'claude',
      mesaSessionId: id,
      payload: JSON.stringify({ session_id: nativeId, hook_event_name: event, ...extra }),
    });
  const titles = () => mesa.notifications.list().map((item) => item.title);

  // A question asked twice within two seconds is one notice, which keeps its id.
  hook('PreToolUse', { tool_name: 'AskUserQuestion', tool_input: { question: 'Choose' } });
  const [question] = mesa.notifications.list();
  hook('PermissionRequest', { tool_name: 'AskUserQuestion', tool_input: { question: 'Choose' } });
  expect(mesa.notifications.list()).toMatchObject([
    { id: question?.id, title: 'Question needs an answer' },
  ]);
  hook('SubagentStop', { agent_id: 'agent-lantern', agent_type: 'Explore' });
  expect(mesa.notifications.list()).toMatchObject([{ id: question?.id }]);
  hook('PermissionRequest', { agent_id: 'agent-lantern', tool_name: 'Bash' });
  expect(titles()).toEqual(['Subagent needs permission']);
  hook('PermissionRequest', { tool_name: 'Bash' });
  expect(titles()).toEqual(['Session needs permission']);
  hook('Stop');
  hook('Stop', {}, other.id);
  const first = mesa.notifications.list();
  expect(first.map(({ kind, title, target }) => ({ kind, title, target }))).toEqual([
    { kind: 'finished', title: 'Session turn finished', target: { kind: 'session', id: other.id } },
    {
      kind: 'finished',
      title: 'Session turn finished',
      target: { kind: 'session', id: session.id },
    },
  ]);
  expect(first.every((item) => !item.read)).toBe(true);

  const id = first[1]?.id;
  if (!id) throw new Error('expected a finished inbox item');
  mesa.notifications.markRead(id);
  const restarted = createMesa('default', testDeps(home));
  expect(restarted.notifications.list()[1]).toMatchObject({ id, read: true });
  restarted.notifications.clear(id);
  expect(restarted.notifications.list()).toHaveLength(1);
  expect(createMesa('other', testDeps(home)).notifications.list()).toEqual([]);
});

const HOOKS_HINT = 'not installed: run `mesa hooks install`';

test('each Doctor fix is its own notice, and a finding without one keeps its name and hint', () => {
  const { run } = scriptedRunner();
  const { mesa } = projectProfile(run);
  const check = (name: string, hint: string) => ({
    name,
    ok: false,
    status: 'warn' as const,
    hint,
  });
  mesa.notifications.recordDoctor({
    healthy: true,
    summary: '',
    checks: [
      check('claude hooks', HOOKS_HINT),
      check('vault', 'missing log.md, wiki: run `mesa vault init`'),
      check('codex daemon', 'a Codex app-server daemon runs'),
    ],
  });
  expect(
    mesa.notifications.list().map(({ title, detail, fix }) => ({ title, detail, fix })),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ title: 'Session hooks are not enabled', fix: 'hooks install' }),
      expect.objectContaining({ title: 'Vault is not set up', fix: 'vault init' }),
      { title: 'Doctor: codex daemon', detail: 'a Codex app-server daemon runs', fix: undefined },
    ]),
  );
  expect(mesa.notifications.list()).toHaveLength(3);
});

test('hooks Mesa installed once read as needing an update, with every hooks finding in it', () => {
  const { run } = scriptedRunner();
  const { mesa } = projectProfile(run);
  const check = (name: string, hint: string) => ({
    name,
    ok: false,
    status: 'warn' as const,
    hint,
  });
  mesa.notifications.recordDoctor({
    healthy: true,
    summary: '',
    checks: [check('claude hooks', HOOKS_UPDATE_HINT), check('antigravity hooks', HOOKS_HINT)],
  });
  expect(
    mesa.notifications.list().map(({ title, detail, fix }) => ({ title, detail, fix })),
  ).toEqual([
    {
      title: 'Session hooks need an update',
      detail:
        "Your coding agents run Mesa's older hooks, so sessions can miss its tracking and advice.",
      fix: 'hooks update',
    },
  ]);
});

test('a fix notice read once stays read while its checks are fixed one at a time', () => {
  const { run } = scriptedRunner();
  const { mesa } = projectProfile(run);
  const report = (names: string[]) => ({
    healthy: true,
    summary: '',
    checks: names.map((name) => ({ name, ok: false, status: 'warn' as const, hint: HOOKS_HINT })),
  });
  mesa.notifications.recordDoctor(report(['claude hooks', 'codex hooks Stop']));
  const [notice] = mesa.notifications.list();
  mesa.notifications.markRead(notice?.id ?? '');
  mesa.notifications.recordDoctor(report(['codex hooks Stop']));
  expect(mesa.notifications.list()).toMatchObject([{ id: notice?.id, read: true }]);
});

test('Doctor findings enter the inbox once, resolve on recheck, and target Doctor', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const report = (status: 'warn' | 'ok') => ({
    healthy: true,
    summary: '',
    checks: [
      { name: 'claude hooks', ok: status === 'ok', status, hint: HOOKS_HINT },
      { name: 'codex hooks Stop', ok: status === 'ok', status, hint: HOOKS_HINT },
    ],
  });
  mesa.notifications.recordDoctor(report('warn'));
  const plan = mesa.notifications.delivery();
  expect(plan).toMatchObject({ kind: 'notice', target: { kind: 'doctor' } });
  if (plan.kind === 'none') throw new Error('expected Doctor notice');
  mesa.notifications.markDelivered(plan.ids);
  const [finding] = mesa.notifications.list();
  // Both hook findings share one fix, so they are one notice that names it.
  expect(finding).toMatchObject({
    kind: 'doctor',
    title: 'Session hooks are not enabled',
    detail: "Mesa can't tell when a coding agent needs you or finishes a turn.",
    fix: 'hooks install',
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
  const store = testStore(home);
  const session = store.create(() => newSession({ agentSessionId: nativeId }));
  const other = store.create(() => newSession());
  let second = 1;
  const hook = (event: string, extra: Record<string, unknown> = {}, id = session.id) =>
    recordHookEvent(
      {
        store,
        eventsDir: paths.events,
        clock: () => new Date(`2026-09-24T12:00:0${second++}.000Z`),
        home,
        secrets: () => [],
      },
      {
        agent: 'claude',
        mesaSessionId: id,
        payload: JSON.stringify({ session_id: nativeId, hook_event_name: event, ...extra }),
      },
    );
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  hook('Stop', {}, other.id);
  hook('PermissionRequest', { tool_name: 'Bash' });
  setConfigValue(paths.config, 'notifications.quiet', 'true', lockDeps());
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  setConfigValue(paths.config, 'notifications.quiet', 'false', lockDeps());
  const plan = mesa.notifications.delivery();
  expect(plan).toMatchObject({ kind: 'digest', title: '2 Mesa notices', sound: true });
  if (plan.kind === 'none') throw new Error('expected digest');
  expect(createMesa('default', testDeps(home)).notifications.delivery()).toEqual(plan);
  mesa.notifications.markDelivered(plan.ids);
  expect(createMesa('default', testDeps(home)).notifications.delivery()).toEqual({ kind: 'none' });

  setConfigValue(paths.config, 'notifications.finished', 'off', lockDeps());
  hook('Stop');
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  setConfigValue(paths.config, 'notifications.finished', 'sound', lockDeps());
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
});

test('delivery acknowledges a full inbox and a session notice across two batches', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const session = testStore(home).create(() => newSession());
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
  mesa.notifications.recordDoctor({
    healthy: true,
    summary: '',
    checks: Array.from({ length: 500 }, (_, index) => ({
      name: `Finding ${index}`,
      ok: false,
      status: 'warn' as const,
      hint: 'Review setup',
    })),
  });
  const file = eventsLog(profilePaths(home, 'default').events, session.id);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(
    file,
    `${JSON.stringify({ at: '2026-09-24T12:00:03.000Z', agent: 'claude', event: 'Stop', payload: {} })}\n`,
  );
  const first = mesa.notifications.delivery();
  expect(first.kind).toBe('digest');
  if (first.kind === 'none') throw new Error('expected first batch');
  expect(first.ids).toHaveLength(500);
  mesa.notifications.markDelivered(first.ids);
  const restarted = createMesa('default', testDeps(home));
  const second = restarted.notifications.delivery();
  expect(second.kind).toBe('notice');
  if (second.kind === 'none') throw new Error('expected remaining notice');
  expect(second.ids).toHaveLength(1);
  restarted.notifications.markDelivered(second.ids);
  expect(mesa.notifications.delivery()).toEqual({ kind: 'none' });
});

test('inbox keeps unread notices when later hooks exceed a bounded scan window', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const session = testStore(home).create(() => newSession());
  const file = eventsLog(profilePaths(home, 'default').events, session.id);
  mkdirSync(dirname(file), { recursive: true });
  const event = (at: string, name: string, payload: object = {}) =>
    `${JSON.stringify({ at, agent: 'claude', event: name, payload })}\n`;
  appendFileSync(file, event('2026-09-24T12:00:00.000Z', 'Stop'));
  expect(mesa.notifications.list().map((item) => item.at)).toEqual(['2026-09-24T12:00:00.000Z']);
  appendFileSync(
    file,
    event('2026-09-24T12:00:01.000Z', 'PostToolUse', { filler: 'x'.repeat(128 * 1024) }),
  );
  appendFileSync(file, event('2026-09-24T12:00:02.000Z', 'Stop'));
  expect(
    createMesa('default', testDeps(home))
      .notifications.list()
      .map((item) => item.at),
  ).toEqual(['2026-09-24T12:00:02.000Z']);
});

test('inbox drops old markers when a newer notice replaces theirs', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const session = testStore(home).create(() => newSession());
  const stateFile = profilePaths(home, 'default').notifications;
  const file = eventsLog(profilePaths(home, 'default').events, session.id);
  mkdirSync(dirname(file), { recursive: true });
  const event = (at: string) =>
    `${JSON.stringify({ at, agent: 'claude', event: 'Stop', payload: {} })}\n`;
  appendFileSync(file, event('2026-09-24T12:00:00.000Z'));
  const id = mesa.notifications.list()[0]?.id;
  if (!id) throw new Error('missing first notice');
  mesa.notifications.markRead(id);
  mesa.notifications.clear(id);
  appendFileSync(file, event('2026-09-24T12:00:05.000Z'));
  expect(mesa.notifications.list()).toMatchObject([
    { at: '2026-09-24T12:00:05.000Z', read: false },
  ]);
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as {
    read: string[];
    cleared: string[];
  };
  expect(state.read).toEqual([]);
  expect(state.cleared).toEqual([]);
});

test('a state file with several notices for a session shows only its newest', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const stateFile = profilePaths(home, 'default').notifications;
  const notice = (at: string, kind: 'subagent' | 'input-required', title: string) => ({
    session: 'aaaaaaaa',
    at,
    kind,
    title,
    fingerprint: `${kind}-fingerprint`,
    target: { kind: 'session', id: 'aaaaaaaa' },
  });
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(
    stateFile,
    JSON.stringify({
      read: [],
      cleared: [],
      items: [
        notice('2026-09-24T12:00:00.000Z', 'input-required', 'Session needs permission'),
        notice('2026-09-24T12:00:05.000Z', 'subagent', 'Subagent needs permission'),
      ],
    }),
  );
  expect(mesa.notifications.list().map((item) => item.title)).toEqual([
    'Subagent needs permission',
  ]);
});

test('clearAll clears every current notice at once and keeps hook offsets so none return', () => {
  const { run } = scriptedRunner();
  const { home, mesa } = projectProfile(run);
  const session = testStore(home).create(() => newSession());
  const stateFile = profilePaths(home, 'default').notifications;
  const file = eventsLog(profilePaths(home, 'default').events, session.id);
  mkdirSync(dirname(file), { recursive: true });
  const event = (at: string) =>
    `${JSON.stringify({ at, agent: 'claude', event: 'Stop', payload: {} })}\n`;
  appendFileSync(file, event('2026-09-24T12:00:00.000Z') + event('2026-09-24T12:00:05.000Z'));
  mesa.notifications.recordDoctor({
    healthy: true,
    summary: '',
    checks: [{ name: 'claude hooks', ok: false, status: 'warn', hint: HOOKS_HINT }],
  });
  expect(mesa.notifications.list()).toHaveLength(2);
  expect(mesa.notifications.clearAll()).toBe(2);
  expect(mesa.notifications.list()).toEqual([]);
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as {
    cleared: string[];
    offsets: Record<string, number>;
  };
  expect(state.cleared).toHaveLength(2);
  expect(state.offsets[session.id]).toBeGreaterThan(0);
  expect(createMesa('default', testDeps(home)).notifications.list()).toEqual([]);
  expect(mesa.notifications.clearAll()).toBe(0);
  appendFileSync(file, event('2026-09-24T12:00:10.000Z'));
  expect(mesa.notifications.list().map((item) => item.at)).toEqual(['2026-09-24T12:00:10.000Z']);
});

test('an automation acknowledgement survives more than 1000 unrelated deliveries and restart', async () => {
  const { run } = scriptedRunner({ '/usr/bin/id': '501\n' });
  const { home, mesa } = projectProfile(run);
  await mesa.decisions.use('none');
  mesa.automations.add({
    name: 'Missing skill',
    project: 'lantern-cove',
    when: 'cron',
    cron: '* * * * *',
    run: 'skill',
    skill: 'missing-skill',
    guardrail: 'allow',
  });
  await mesa.automations.install();
  expect((await mesa.automations.tick()).runs[0]?.status).toBe('failed');
  automationState(profilePaths(home, 'default').automationState, lockDeps()).update((state) => {
    const failed = state.runs[0];
    if (!failed) throw new Error('missing failed run');
    failed.reason = `${'x'.repeat(299)}😀more detail`;
  });
  const first = mesa.notifications.claimDelivery();
  if (first.kind === 'none') throw new Error('expected automation notice');
  expect(first.body).toBe(`${'x'.repeat(299)}😀`);
  mesa.notifications.recordDoctor({
    healthy: true,
    summary: '',
    checks: Array.from({ length: 1001 }, (_, index) => ({
      name: `Finding ${index}`,
      ok: false,
      status: 'warn' as const,
      hint: 'Review setup',
    })),
  });
  for (const count of [500, 500, 1]) {
    const plan = mesa.notifications.claimDelivery();
    if (plan.kind === 'none') throw new Error('expected new Doctor notices');
    expect(plan.ids).toHaveLength(count);
    expect(plan.ids).not.toContain(first.id);
  }
  expect(createMesa('default', testDeps(home)).notifications.claimDelivery()).toEqual({
    kind: 'none',
  });
  expect(mesa.notifications.list().some((item) => item.id === first.id)).toBe(true);
});
