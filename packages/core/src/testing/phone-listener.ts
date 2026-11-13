import { join } from 'node:path';
import type { Clock } from '../lib/clock.js';
import type { MacPath } from '../phone/protocol/direct.js';
import type { PhoneMessage } from '../phone/protocol/envelope.js';
import { phoneKeys } from '../phone/protocol/join.js';
import { phoneLine } from '../phone/protocol/line.js';
import { phoneQueue } from '../phone/serve/queue.js';
import { profilePaths } from '../profile/paths.js';
import { recordHookEvent } from '../sessions/signals/hook-events.js';
import { CLAUDE_VERSION } from './agents.js';
import { fixedClock } from './clock.js';
import type { fakeDirectSocket } from './direct-socket.js';
import { fakePairingBroker } from './pairing-broker.js';
import { fakePhone } from './phone.js';
import { projectProfile } from './profile.js';
import { scriptedRunner } from './runner.js';
import { memorySecretStore } from './secrets.js';
import { newSession, plantOutputLog, testStore } from './sessions.js';
import type { manualTimers } from './timers.js';
import { fakeTmux } from './tmux.js';

const NOW = fixedClock()();

/**
 * A paired profile (its session `store`) with one record-only session (`session`), its phone listener running, and the
 * phone's end of the mailbox (`calls`, and what the Mac `pushed`); `world` is the tmux a live
 * session opens in, and `mesaYaml` the project's. `ran` is every command the Mac ran and `dials`
 * how often the listener dialed the broker; `clock` is the Mac's, and `tmux` sees each tmux
 * command first. `end` stops the listener and returns its end. With `direct`, the Mac also has
 * its own socket and the phone's line dials it on `timers`; `paths` is each path the line took.
 */
export async function servingPhone(
  mesaYaml?: string,
  opts: {
    clock?: Clock;
    tmux?: (command: string[]) => void;
    direct?: ReturnType<typeof fakeDirectSocket>;
    timers?: ReturnType<typeof manualTimers>;
  } = {},
) {
  const broker = fakePairingBroker('https://broker.test', () => NOW);
  const world = fakeTmux(opts.tmux ? { before: opts.tmux } : {});
  let dials = 0;
  const runner = scriptedRunner({
    '/usr/bin/id': '501\n',
    tmux: world.answer,
    claude: CLAUDE_VERSION,
  });
  const { mesa, home } = projectProfile(runner.run, {
    ...(mesaYaml === undefined ? {} : { mesaYaml }),
    ...(opts.clock ? { clock: opts.clock } : {}),
    http: broker.http,
    connect: (url, on) => {
      dials += 1;
      return broker.connect(url, on);
    },
    secretStore: memorySecretStore().store,
    env: { MESA_BROKER_URL: 'https://broker.test' },
    ...(opts.direct ? { listenDirect: opts.direct.listen } : {}),
  });
  const phone = fakePhone(broker.http, () => NOW);
  await phone.join((await mesa.phone.pair()).result.qr);
  await mesa.phone.status();
  const store = testStore(home);
  const session = store.create(() =>
    newSession({ goal: 'Fix the login page\nwith tests', name: 'Login fix' }),
  );
  plantOutputLog(home, session.id, 'npm test\n12 passing\n');

  const stop = new AbortController();
  const listener = mesa.phone.serve(stop.signal);
  const p = phone.pairing;
  if (!p) throw new Error('not joined');
  const pushed: PhoneMessage[] = [];
  const paths: MacPath[] = [];
  let ids = 0;
  const { timers } = opts;
  const line = phoneLine(
    {
      connect: opts.direct ? opts.direct.connect(broker.connect) : broker.connect,
      now: timers ? () => new Date(timers.now()) : () => NOW,
      wait: timers?.wait ?? (() => new Promise(() => {})),
      newId: () => `q${++ids}`,
    },
    { ...p, token: p.phoneToken, keys: phoneKeys(p) },
    {
      message: (message) => {
        if (message.kind !== 'response' && message.kind !== 'direct') pushed.push(message);
      },
      path: (path) => paths.push(path),
    },
  );
  const calls = { call: line.call };
  line.connect();
  const end = async () => {
    stop.abort();
    line.close();
    return listener;
  };
  return {
    mesa,
    home,
    store,
    world,
    session,
    calls,
    pushed,
    line,
    paths,
    ran: runner.calls,
    dials: () => dials,
    end,
  };
}

export type ServingPhone = Awaited<ReturnType<typeof servingPhone>>;

/**
 * A live Claude session opened in the serving profile's tmux, idle, with `hook` to record its
 * agent's next hook event (`UserPromptSubmit` starts a turn, `Stop` ends it).
 */
export async function livePhoneSession(at: ServingPhone, opts: { goal?: string } = {}) {
  const { result: opened } = await at.mesa.sessions.open('lantern-cove', opts);
  const window = at.world.windows.find((w) => w.env.MESA_SESSION_ID === opened.id);
  if (!window) throw new Error('no window opened');
  const hook = (event: string) =>
    recordHookEvent(
      {
        store: testStore(at.home),
        eventsDir: profilePaths(at.home, 'default').events,
        clock: () => NOW,
        home: at.home,
        secrets: () => [],
      },
      {
        agent: 'claude',
        mesaSessionId: opened.id,
        payload: JSON.stringify({ hook_event_name: event }),
      },
    );
  hook('Stop');
  return { id: opened.id, window, hook };
}

/**
 * Lets the listener's loop run until `done`, up to 5 s: it looks again when the file watch hears
 * a change, which comes a moment after the write.
 */
export async function untilTrue(done: () => boolean | Promise<boolean>) {
  const end = Date.now() + 5000;
  while (!(await done()) && Date.now() < end) await new Promise((r) => setTimeout(r, 5));
  return done();
}

/**
 * Queues `text` for `session` in `home`'s default profile, as the listener does for a reply the
 * phone sent while it worked (CONTEXT.md, Queued message); returns the message's id.
 */
export function plantQueuedMessage(home: string, session: string, text: string) {
  const queue = phoneQueue({
    file: join(profilePaths(home, 'default').root, 'phone-queue.json'),
    lock: { processId: process.pid, processAlive: () => false, clock: fixedClock() },
    clock: fixedClock(),
    newId: () => `m${queue.all().length + 1}`,
  });
  queue.add(session, text, false);
  return queue.all().at(-1)?.id ?? '';
}
