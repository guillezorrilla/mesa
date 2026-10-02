import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import {
  agentWorld,
  claudeResult,
  type fakeHttp,
  finishesRun,
  profilePaths,
  projectProfile,
  sequentialIds,
  testDeps,
  testStore,
} from '../testing/index.js';

const cron = {
  name: 'Review tides',
  project: 'lantern-cove',
  when: 'cron',
  cron: '*/2 * * * *',
  run: 'open',
  goal: 'Review tides',
  guardrail: 'allow',
};
function setup(
  options: { strict?: boolean; finish?: boolean; http?: ReturnType<typeof fakeHttp>['http'] } = {},
) {
  let time = new Date('2026-10-02T12:00:05Z');
  let loaded = false;
  const world = agentWorld(
    options.finish ? { onOpen: finishesRun({ output: claudeResult('success') }) } : {},
  );
  const run: typeof world.run = async (file, args, timeout) => {
    if (file === '/usr/bin/id') return { ok: true, stdout: '501\n' };
    if (file === '/bin/launchctl') {
      world.calls.push({ file, args, timeoutMs: timeout });
      if (args[0] === 'bootstrap') loaded = true;
      if (args[0] === 'bootout') loaded = false;
      return loaded || args[0] !== 'print'
        ? { ok: true, stdout: '' }
        : { ok: false, reason: 'failed', detail: 'no job' };
    }
    return world.run(file, args, timeout);
  };
  const deps = {
    run,
    newId: sequentialIds(),
    ...(options.http ? { http: options.http } : {}),
    clock: () => time,
    self: ['/opt/mesa/node', '/opt/mesa/mesa.js'],
    env: { PATH: '/opt/agents/bin:/usr/bin:/bin', SECRET: 'never serialize' },
    processAlive: () => true,
  };
  const { mesa, home, dir } = projectProfile(run, {
    ...deps,
    mesaYaml: `name: lantern-cove\nskills: [session-summary]\n${options.strict ? 'guardrail: strict\n' : ''}`,
  });
  mesa.config.set('decisions.backend', 'rules');
  return {
    mesa,
    home,
    dir,
    world,
    deps,
    advance: (minutes = 2) => {
      time = new Date(time.getTime() + minutes * 60_000);
    },
    restart: () => createMesa('default', testDeps(home, deps)),
  };
}

test('no rules or installation is inert; explicit GUI installation is private, scoped and reversible', async () => {
  const { mesa, home, world } = setup();
  const paths = profilePaths(home, 'default');
  expect(await mesa.automations.tick()).toMatchObject({ inert: true });
  expect(existsSync(paths.automationState)).toBe(false);
  mesa.automations.add(cron);
  expect(await mesa.automations.tick()).toMatchObject({ inert: true });
  const installed = await mesa.automations.install();
  expect(installed).toMatchObject({ installed: true, loaded: true });
  const plist = readFileSync(installed.plist, 'utf8');
  expect(plist).toContain('<string>/opt/mesa/node</string><string>/opt/mesa/mesa.js</string>');
  expect(plist).toContain(`<key>WorkingDirectory</key><string>${paths.root}</string>`);
  expect(plist).toContain('/opt/agents/bin:/usr/bin:/bin');
  expect(plist).not.toContain('never serialize');
  expect(statSync(installed.plist).mode & 0o777).toBe(0o600);
  expect(world.calls.some((c) => c.args.includes('gui/501'))).toBe(true);
  expect(await mesa.automations.uninstall()).toMatchObject({ installed: false, loaded: false });
  expect(existsSync(installed.plist)).toBe(false);
  expect(await mesa.automations.tick()).toMatchObject({ inert: true });
});

test('cron observations fire once, persist provenance and Faro probabilities, and coalesce missed minutes', async () => {
  const { mesa, home, advance, restart } = setup();
  mesa.automations.add(cron);
  await mesa.automations.install();
  const first = await mesa.automations.tick();
  expect(first.runs).toHaveLength(1);
  expect(first.runs[0]?.status).toBe('done');
  const session = testStore(home).get(first.runs[0]?.result?.session as string);
  expect(session.automation).toEqual({ rule: cron.name, run: first.runs[0]?.id });
  expect((await restart().automations.tick()).runs).toEqual([]);
  advance(8);
  expect((await restart().automations.tick()).runs).toHaveLength(1);
  const receipts = listReceipts(join(home, 'vault')).filter((r) => r.receipt.kind === 'automation');
  expect(receipts).toHaveLength(2);
  const decision = receipts[0]?.receipt.decisions[0];
  expect(decision?.kind).toBe('Choice');
  if (decision?.kind === 'Choice') expect(decision.confidence).toBeGreaterThan(0);
  await mesa.automations.uninstall();
  expect(
    testStore(home)
      .list()
      .every((r) => r.endedAt),
  ).toBe(true);
});

test('Ask persists until approved; Allow honors strict guards and cannot override a block', async () => {
  const { mesa, restart, home } = setup({ strict: true });
  mesa.automations.add({ ...cron, guardrail: 'ask' });
  mesa.automations.add({ ...cron, name: 'Allow strict' });
  mesa.automations.add({ ...cron, name: 'Blocked', goal: 'rm -rf /' });
  await mesa.automations.install();
  const tick = await mesa.automations.tick();
  expect(tick.runs.map((r) => r.status)).toEqual(['pending', 'failed']);
  const pending = (await restart().automations.status()).runs.filter((r) => r.status === 'pending');
  expect(pending).toHaveLength(2);
  expect(testStore(home).list()).toEqual([]);
  for (const run of pending) mesa.automations.approve(run.id);
  expect((await restart().automations.tick()).runs.map((r) => r.status)).toEqual(['done', 'done']);
  await mesa.automations.uninstall();
});

test('file baseline and changes are observed once; disabled queued definitions do not run', async () => {
  const { mesa, dir, advance, home } = setup();
  const file = join(dir, 'tides.md');
  writeFileSync(file, 'first');
  mesa.automations.add({
    ...cron,
    when: 'file',
    cron: undefined,
    file: 'tides.md',
    guardrail: 'ask',
  });
  await mesa.automations.install();
  expect((await mesa.automations.tick()).runs).toEqual([]);
  writeFileSync(file, 'second');
  advance();
  await mesa.automations.tick();
  const pending = (await mesa.automations.status()).runs[0];
  expect(pending?.trigger).toMatchObject({
    kind: 'file',
    previous: expect.any(String),
    value: expect.any(String),
  });
  mesa.automations.approve(pending?.id as string);
  mesa.automations.setEnabled(cron.name, false);
  await mesa.automations.tick();
  // A disabled-only profile is inert; uninstall retires the saved queue.
  await mesa.automations.uninstall();
  expect(testStore(home).list()).toEqual([]);
  expect((await mesa.automations.status()).runs[0]?.status).toBe('cancelled');
});

test('skill execution uses the existing run owner and carries rule provenance', async () => {
  const { mesa, home } = setup({ finish: true });
  mesa.automations.add({ ...cron, run: 'skill', goal: undefined, skill: 'session-summary' });
  await mesa.automations.install();
  const done = (await mesa.automations.tick()).runs[0];
  expect(done?.reason).toBeUndefined();
  expect(done).toMatchObject({ status: 'done' });
  expect(testStore(home).get(done?.result?.session as string)).toMatchObject({
    kind: 'run',
    automation: { rule: cron.name, run: done?.id },
    endedAt: expect.any(String),
  });
  await mesa.automations.uninstall();
});

test('unowned plist is preserved and install failure leaves the scheduler inactive', async () => {
  const { mesa, home } = setup();
  const dir = join(home, 'Library/LaunchAgents');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'com.mesa.automations.default.plist');
  writeFileSync(file, 'belongs to someone else');
  await expect(mesa.automations.install()).rejects.toThrow('not owned');
  await mesa.automations.uninstall();
  expect(readFileSync(file, 'utf8')).toBe('belongs to someone else');
});

test('scheduled refresh is change-aware and a second tick queues without overlapping a project action', async () => {
  const link = 'https://example.test/tides';
  let html =
    '<html><head><title>Tides</title></head><body><article><p>The tide is at eight in the morning. Check before sailing.</p></article></body></html>';
  let release: (() => void) | undefined;
  let entered: (() => void) | undefined;
  let blocked = false;
  const http = async () => {
    if (blocked) {
      entered?.();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      blocked = false;
    }
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  };
  const { mesa, home, advance } = setup({ http });
  await mesa.imports.add('lantern-cove', [link], false);
  mesa.automations.add({ ...cron, run: 'refresh', goal: undefined, notes: false });
  await mesa.automations.install();
  const skip = (await mesa.automations.tick()).runs[0];
  expect(skip?.result).toMatchObject({
    checked: ['example-test-tides'],
    skipped: ['example-test-tides'],
    refreshed: [],
  });
  advance();
  html = html.replace('eight', 'nine');
  blocked = true;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const running = mesa.automations.tick();
  await started;
  advance();
  expect(await mesa.automations.tick()).toMatchObject({ busy: true, runs: [] });
  expect((await mesa.automations.status()).runs.map((r) => r.status)).toEqual([
    'done',
    'running',
    'queued',
  ]);
  release?.();
  const settled = await running;
  expect(settled.runs).toHaveLength(2);
  expect(settled.runs[0]?.result?.refreshed).toEqual(['example-test-tides']);
  expect(settled.runs[1]?.result?.skipped).toEqual(['example-test-tides']);
  expect(testStore(home).list()).toEqual([]);
  await mesa.automations.uninstall();
});

test('Faro state transitions retain original probabilities and send via the normal target owner', async () => {
  const { mesa, home, deps, advance } = setup();
  const session = (await mesa.sessions.open('lantern-cove')).result;
  const hook = createMesa(
    'default',
    testDeps(home, { ...deps, env: { ...deps.env, MESA_SESSION_ID: session.id } }),
  );
  await hook.hookEvent(
    'claude',
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: session.agentSessionId }),
  );
  mesa.automations.add({
    ...cron,
    when: 'state',
    cron: undefined,
    state: 'idle',
    run: 'send',
    goal: undefined,
    session: session.id,
    prompt: 'Review the tide schedule',
    guardrail: 'ask',
  });
  await mesa.automations.install();
  await mesa.automations.tick();
  advance();
  await hook.hookEvent(
    'claude',
    JSON.stringify({ hook_event_name: 'Stop', session_id: session.agentSessionId }),
  );
  await mesa.automations.tick();
  const pending = (await mesa.automations.status()).runs[0];
  expect(pending?.trigger).toMatchObject({
    kind: 'state',
    previous: 'working',
    value: 'idle',
    confidence: expect.any(Number),
    decision: { answers: expect.any(Array) },
  });
  expect((await mesa.automations.tick()).runs).toEqual([]);
  mesa.automations.approve(pending?.id as string);
  expect((await mesa.automations.tick()).runs[0]?.status).toBe('done');
  const receipt = listReceipts(join(home, 'vault'), 100, { kind: 'automation' })[0]?.receipt;
  expect(receipt?.decisions.some((d) => d.question === 'state')).toBe(true);
  await mesa.automations.uninstall();
  // A send targets an existing session; uninstall never owns that session.
  expect(testStore(home).get(session.id).endedAt).toBeUndefined();
  await mesa.sessions.stop(session.id, true);
});

test('uninstall cancels queued work while awaiting the owned dispatcher', async () => {
  const link = 'https://example.test/tides';
  let entered: (() => void) | undefined;
  let release: (() => void) | undefined;
  let blocked = false;
  const http = async () => {
    if (blocked) {
      entered?.();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    }
    return new Response(
      '<html><head><title>Tides</title></head><body><article><p>Check the tide before sailing.</p></article></body></html>',
      { headers: { 'content-type': 'text/html' } },
    );
  };
  const { mesa, advance } = setup({ http });
  await mesa.imports.add('lantern-cove', [link], false);
  mesa.automations.add({ ...cron, run: 'refresh', goal: undefined, notes: false });
  await mesa.automations.install();
  blocked = true;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const running = mesa.automations.tick();
  await started;
  advance();
  await mesa.automations.tick();
  const stopping = mesa.automations.uninstall();
  release?.();
  await running;
  expect(await stopping).toMatchObject({ installed: false, loaded: false });
  expect((await mesa.automations.status()).runs.map((r) => r.status)).toEqual([
    'done',
    'cancelled',
  ]);
});

test('an interrupted worker is not replayed and its remaining owned session stops before new work', async () => {
  const { mesa, home, deps, advance, world } = setup();
  mesa.automations.add(cron);
  await mesa.automations.install();
  const first = (await mesa.automations.tick()).runs[0];
  const session = first?.result?.session as string;
  const file = profilePaths(home, 'default').automationState;
  // Seed the durable state a killed dispatcher leaves after launch and before completion.
  const { parse, stringify } = await import('yaml');
  const saved = parse(readFileSync(file, 'utf8'));
  saved.worker = { token: 'dead-worker', pid: 101 };
  saved.runs[0].status = 'running';
  delete saved.runs[0].endedAt;
  writeFileSync(file, stringify(saved));
  advance();
  const restarted = createMesa(
    'default',
    testDeps(home, { ...deps, processAlive: (pid) => pid !== 101 }),
  );
  const before = world.calls.length;
  const next = await restarted.automations.tick();
  expect(next.runs).toHaveLength(1);
  expect((await restarted.automations.status()).runs[0]).toMatchObject({
    status: 'failed',
    reason: expect.stringContaining('not replayed'),
  });
  expect(testStore(home).get(session).endedAt).toBeDefined();
  const calls = world.calls.slice(before);
  expect(calls.findIndex((c) => c.args.includes('kill-window'))).toBeLessThan(
    calls.findIndex((c) => c.args.includes('new-window') || c.args.includes('new-session')),
  );
  await restarted.automations.uninstall();
});
