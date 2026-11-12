import { expect, test } from 'vitest';
import type { Http } from '../lib/http.js';
import { setConfigValue } from '../profile/config.js';
import { recordHookEvent } from '../sessions/signals/hook-events.js';
import {
  fakePairingBroker,
  fakePhone,
  lockDeps,
  memorySecretStore,
  movableClock,
  newSession,
  profilePaths,
  projectProfile,
  scriptedRunner,
  testStore,
} from '../testing/index.js';

/** A paired profile whose phone allowed pushes, a session in it, and an ioreg the test sets. */
async function setup(options: { http?: (broker: Http) => Http } = {}) {
  const time = movableClock('2026-11-11T10:00:00.000Z');
  const mac = { idleSeconds: 0, locked: false };
  const { run, calls } = scriptedRunner({
    '/usr/sbin/ioreg': (args) =>
      args.includes('IOHIDSystem')
        ? `| |   "HIDIdleTime" = ${mac.idleSeconds * 1e9}\n`
        : `"IOConsoleLocked" = ${mac.locked ? 'Yes' : 'No'}\n`,
  });
  const broker = fakePairingBroker('https://broker.test', time.clock);
  const { mesa, home } = projectProfile(run, {
    http: options.http?.(broker.http) ?? broker.http,
    secretStore: memorySecretStore().store,
    clock: time.clock,
    env: { MESA_BROKER_URL: 'https://broker.test' },
  });
  const phone = fakePhone(broker.http, time.clock);
  await phone.join((await mesa.phone.pair()).result.qr);
  await mesa.phone.status();
  await phone.allowPushes();
  const store = testStore(home);
  const session = store.create(() =>
    newSession({ project: 'lantern-cove', name: 'Fix the login bug' }),
  );
  let asked = 0;
  const ask = () => {
    time.pass(5_000);
    asked += 1;
    recordHookEvent(
      {
        store,
        eventsDir: profilePaths(home, 'default').events,
        clock: time.clock,
        home,
        secrets: () => [],
      },
      {
        agent: 'claude',
        mesaSessionId: session.id,
        payload: JSON.stringify({
          hook_event_name: 'PermissionRequest',
          tool_name: `Bash${asked}`,
        }),
      },
    );
  };
  const pushes = () =>
    (broker.rooms.get('pairing-0000000001')?.pushes ?? []).map((push) => ({
      kind: push.kind,
      notice: phone.openPush(push.notice),
    }));
  const ioreg = () => calls.filter((call) => call.file === '/usr/sbin/ioreg').length;
  return { mesa, config: profilePaths(home, 'default').config, mac, time, ask, pushes, ioreg };
}

test('away, a question is pushed once, sealed with its title, project and what happened', async () => {
  const s = await setup();
  s.mac.idleSeconds = 5 * 60;
  s.ask();
  expect(await s.mesa.phone.push()).toMatchObject({
    status: 'pushed',
    pushed: [expect.any(String)],
  });
  expect(s.pushes()).toEqual([
    {
      kind: 'input',
      notice: {
        title: 'Fix the login bug',
        body: 'lantern-cove: Session needs permission',
        session: expect.stringMatching(/^\w+$/),
      },
    },
  ]);
  // The same notice is never pushed twice.
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'none' });
  expect(s.pushes()).toHaveLength(1);
});

test('at the desk nothing is pushed; the notice goes once the person is away, unless read or stale', async () => {
  const s = await setup();
  s.mac.idleSeconds = 4 * 60;
  s.ask();
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'at-desk', pushed: [] });
  expect(s.pushes()).toEqual([]);
  // The person walks away before answering: the question goes once they count as away.
  s.time.pass(60_000);
  s.mac.idleSeconds = 5 * 60;
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'pushed' });
  expect(s.pushes()).toHaveLength(1);

  // One read at the desk never goes, nor one older than the window.
  s.mac.idleSeconds = 0;
  s.ask();
  const [read] = s.mesa.notifications.list();
  s.mesa.notifications.markRead(read?.id ?? '');
  s.mac.idleSeconds = 600;
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'none' });
  s.mac.idleSeconds = 0;
  s.ask();
  s.time.pass(16 * 60_000);
  s.mac.idleSeconds = 600;
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'none' });
  expect(s.pushes()).toHaveLength(1);
});

test('a locked screen counts as away', async () => {
  const s = await setup();
  s.mac.locked = true;
  s.ask();
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'pushed' });
  expect(s.pushes()).toHaveLength(1);
});

test('`always` pushes at the desk without asking ioreg; `never` pushes nothing', async () => {
  const s = await setup();
  setConfigValue(s.config, 'phone.push', 'never', lockDeps());
  s.ask();
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'off' });
  setConfigValue(s.config, 'phone.push', 'always', lockDeps());
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'pushed' });
  expect(s.ioreg()).toBe(0);
  expect(s.pushes()).toHaveLength(1);
});

test('`phone.awayAfter` sets the idle minutes', async () => {
  const s = await setup();
  setConfigValue(s.config, 'phone.awayAfter', '1', lockDeps());
  s.mac.idleSeconds = 90;
  s.ask();
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'pushed' });
});

test('a failed push leaves the notice in the Inbox and is not tried again', async () => {
  let offline = false;
  const s = await setup({
    http: (broker) => async (url, init) => {
      if (offline) throw new Error('offline');
      return broker(url, init);
    },
  });
  s.mac.idleSeconds = 600;
  offline = true;
  s.ask();
  expect(await s.mesa.phone.push()).toMatchObject({
    status: 'failed',
    failed: [{ id: expect.any(String), error: '0 unreachable' }],
  });
  offline = false;
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'none' });
  expect(s.pushes()).toEqual([]);
  expect(s.mesa.notifications.list()).toMatchObject([{ title: 'Session needs permission' }]);
});

test('push-test sends a sealed notice now, whatever the idle time', async () => {
  const s = await setup();
  expect(await s.mesa.phone.pushTest()).toEqual({ pairingId: 'pairing-0000000001', sent: true });
  expect(s.pushes()).toEqual([
    { kind: 'input', notice: { title: 'Mesa', body: 'Pushes from this Mac reach your phone' } },
  ]);
  expect(s.ioreg()).toBe(0);
});

test("the scheduler's delivery pushes too, so the phone hears with the app closed", async () => {
  const s = await setup();
  s.mac.idleSeconds = 600;
  s.ask();
  await s.mesa.notifications.deliver();
  expect(s.pushes()).toHaveLength(1);
  expect(await s.mesa.phone.push()).toMatchObject({ status: 'none' });
});
