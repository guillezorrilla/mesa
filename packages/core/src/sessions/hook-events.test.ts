import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fixedClock, lockDeps, newSession, sequentialIds, tempDir } from '../testing/index.js';
import { readHookEvents, recordHookEvent, scanHookEvents } from './hook-events.js';
import { sessionStore } from './store.js';

// Payloads shaped like the ones docs/spikes/state-signals.md recorded, with invented values.
const SESSION_START = {
  session_id: '36c173f2-803e-4845-bd97-a032b37c6d6d',
  transcript_path: '/Users/ana/.claude/projects/-src-lantern-cove/36c173f2.jsonl',
  cwd: '/src/lantern-cove',
  hook_event_name: 'SessionStart',
  source: 'startup',
};
const PERMISSION = {
  session_id: '36c173f2-803e-4845-bd97-a032b37c6d6d',
  hook_event_name: 'PermissionRequest',
  tool_name: 'Bash',
  tool_input: { command: 'deploy', api_key: 'sk-live-1234', env: { GITHUB_TOKEN: 'ghp_x' } },
};

function setUp() {
  const home = '/Users/ana';
  const dir = join(tempDir(), 'sessions');
  const store = sessionStore({ dir, newId: sequentialIds(), lock: lockDeps() });
  const { id } = store.create(() => newSession());
  const deps = {
    store,
    eventsDir: join(dir, 'events'),
    clock: fixedClock(),
    home,
    secrets: () => ['sk-conf-9876'],
  };
  const log = () =>
    readFileSync(join(dir, 'events', `${id}.jsonl`), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  return { store, id, deps, dir, log };
}

test('bounded hook reads keep whole recent JSONL entries', () => {
  const { id, deps } = setUp();
  recordHookEvent(deps, {
    agent: 'claude',
    mesaSessionId: id,
    payload: JSON.stringify(SESSION_START),
  });
  const file = join(deps.eventsDir, `${id}.jsonl`);
  const first = readFileSync(file, 'utf8');
  writeFileSync(file, `${first}${first.replace('SessionStart', 'Stop')}`);
  expect(readHookEvents(deps.eventsDir, id)).toHaveLength(2);
  expect(readHookEvents(deps.eventsDir, id, first.length + 10).map((event) => event.event)).toEqual(
    ['Stop'],
  );
});

test('incremental hook scans cross chunks and resume after a partial line', () => {
  const { id, deps } = setUp();
  const file = join(deps.eventsDir, `${id}.jsonl`);
  const large = JSON.stringify({
    at: '2026-09-24T12:00:00.000Z',
    agent: 'claude',
    event: 'Stop',
    payload: { parts: Array(70_000).fill('x') },
  });
  mkdirSync(deps.eventsDir, { recursive: true });
  writeFileSync(file, `${large}\n{"at":"2026-09-24T12:01:00.000Z","event":"SessionEnd"`);
  const seen: string[] = [];
  const offset = scanHookEvents(deps.eventsDir, id, 0, (event) => seen.push(event.event));
  expect(seen).toEqual(['Stop']);
  expect(offset).toBe(Buffer.byteLength(large) + 1);
  appendFileSync(file, '}\n');
  expect(scanHookEvents(deps.eventsDir, id, offset, (event) => seen.push(event.event))).toBe(
    readFileSync(file).length,
  );
  expect(seen).toEqual(['Stop', 'SessionEnd']);
});

test('a hook appends one line, and gives the record its agent session id once', () => {
  const { store, id, deps, log } = setUp();
  const payload = JSON.stringify(SESSION_START);
  expect(recordHookEvent(deps, { agent: 'claude', mesaSessionId: id, payload })).toMatchObject({
    event: 'SessionStart',
  });
  recordHookEvent(deps, {
    agent: 'claude',
    mesaSessionId: id,
    payload: JSON.stringify(PERMISSION),
  });
  expect(log().map((l) => [l.at, l.agent, l.event, l.agentSessionId])).toEqual([
    ['2026-09-24T12:00:00.000Z', 'claude', 'SessionStart', SESSION_START.session_id],
    ['2026-09-24T12:00:00.000Z', 'claude', 'PermissionRequest', SESSION_START.session_id],
  ]);
  expect(store.get(id).agentSessionId).toBe(SESSION_START.session_id);
});

test('payloads are redacted: secret-named keys, and the home directory', () => {
  const { id, deps, log } = setUp();
  recordHookEvent(deps, {
    agent: 'claude',
    mesaSessionId: id,
    payload: JSON.stringify(SESSION_START),
  });
  recordHookEvent(deps, {
    agent: 'claude',
    mesaSessionId: id,
    payload: JSON.stringify(PERMISSION),
  });
  const [start, permission] = log();
  expect(start.payload.transcript_path).toBe('~/.claude/projects/-src-lantern-cove/36c173f2.jsonl');
  expect(permission.payload.tool_input).toEqual({
    command: 'deploy',
    api_key: '***',
    env: { GITHUB_TOKEN: '***' },
  });
});

test('a hook from outside a Mesa session writes nothing', () => {
  const { deps, dir } = setUp();
  for (const mesaSessionId of [undefined, '', '../../x', 'NOT-AN-ID']) {
    expect(
      recordHookEvent(deps, { agent: 'claude', mesaSessionId, payload: '{}' }),
    ).toBeUndefined();
  }
  expect(existsSync(join(dir, 'events'))).toBe(false);
});

test('the home directory is redacted at a path boundary, also in its escaped form; strings are cut', () => {
  const { id, deps, log } = setUp();
  const payload = {
    hook_event_name: 'PostToolUse',
    cwd: '/Users/ana/src/app',
    other: '/Users/ana2/src',
    transcript_path: '/Users/ana/.claude/projects/-Users-ana-src-app/1.jsonl',
    tool_response: `key sk-conf-9876 ${'x'.repeat(300)}`,
  };
  recordHookEvent(deps, { agent: 'claude', mesaSessionId: id, payload: JSON.stringify(payload) });
  const [line] = log();
  expect(line.payload).toMatchObject({
    cwd: '~/src/app',
    other: '/Users/ana2/src',
    transcript_path: '~/.claude/projects/~-src-app/1.jsonl',
  });
  expect(line.payload.tool_response).toBe(`key *** ${'x'.repeat(192)}...`);
});

test('a nested claude, with another agent session id, is not logged as the session', () => {
  const { store, id, deps, dir } = setUp();
  store.update(id, { agentSessionId: 'the-sessions-own' });
  const nested = JSON.stringify({ session_id: 'a-child', hook_event_name: 'Stop' });
  expect(
    recordHookEvent(deps, { agent: 'claude', mesaSessionId: id, payload: nested }),
  ).toBeUndefined();
  expect(existsSync(join(dir, 'events'))).toBe(false);
});

test('a claude run inside a Codex session or a plain terminal never claims that record', () => {
  const { store, deps, dir } = setUp();
  const codex = store.create(() => newSession({ agent: 'codex' })).id;
  const terminal = store.create(() =>
    newSession({
      kind: 'terminal',
      agent: 'terminal',
      tmux: { socket: 's', session: 'p', window: 'w' },
    }),
  ).id;
  for (const id of [codex, terminal])
    expect(
      recordHookEvent(deps, {
        agent: 'claude',
        mesaSessionId: id,
        payload: JSON.stringify(SESSION_START),
      }),
    ).toBeUndefined();
  expect(store.get(codex)?.agentSessionId).toBeUndefined();
  expect(existsSync(join(dir, 'events'))).toBe(false);
});

test('a resumed background claude keeps its first environment; its hooks reach the live record', () => {
  const { store, id, deps } = setUp();
  const native = SESSION_START.session_id;
  store.update(id, { agentSessionId: native, endedAt: '2026-09-24T12:05:00.000Z' });
  const resumed = store.create(() => newSession({ agentSessionId: native, resumedFrom: id })).id;
  const stop = JSON.stringify({ session_id: native, hook_event_name: 'Stop' });
  expect(
    recordHookEvent(deps, { agent: 'claude', mesaSessionId: id, payload: stop }),
  ).toMatchObject({ mesaSessionId: resumed, event: 'Stop' });
  expect(readHookEvents(deps.eventsDir, resumed).map((e) => e.event)).toEqual(['Stop']);
});

test('a /clear moves the session to its new agent session id; later events under it are kept', () => {
  const { store, id, deps, log } = setUp();
  store.update(id, { agentSessionId: 'before-clear' });
  const hook = (payload: object) =>
    recordHookEvent(deps, { agent: 'claude', mesaSessionId: id, payload: JSON.stringify(payload) });
  // The spike's order (docs/spikes/context-use.md): SessionEnd under the old id, SessionStart under the new.
  hook({ session_id: 'before-clear', hook_event_name: 'SessionEnd', reason: 'clear' });
  expect(
    hook({ session_id: 'after-clear', hook_event_name: 'SessionStart', source: 'clear' }),
  ).toMatchObject({ event: 'SessionStart', agentSessionId: 'after-clear' });
  expect(store.get(id).agentSessionId).toBe('after-clear');
  expect(hook({ session_id: 'after-clear', hook_event_name: 'Stop' })).toBeDefined();
  // Now the old id, and any third one, are another claude's.
  expect(hook({ session_id: 'before-clear', hook_event_name: 'Stop' })).toBeUndefined();
  expect(hook({ session_id: 'a-child', hook_event_name: 'Stop' })).toBeUndefined();
  expect(log().map((e) => [e.event, e.agentSessionId])).toEqual([
    ['SessionEnd', 'before-clear'],
    ['SessionStart', 'after-clear'],
    ['Stop', 'after-clear'],
  ]);
});

test.each(['claude', 'codex'] as const)('another native id is never claimed by %s', (agent) => {
  const { store, id, deps, dir } = setUp();
  store.update(id, { agent, agentSessionId: 'the-sessions-own' });
  // A nested codex, which a tool runs, starts with startup (codex exec), resume, or fork.
  for (const source of ['startup', 'resume', 'compact', 'fork', undefined]) {
    const start = JSON.stringify({
      session_id: 'a-child',
      hook_event_name: 'SessionStart',
      source,
    });
    const event = recordHookEvent(deps, { agent, mesaSessionId: id, payload: start });
    if (agent === 'codex') expect(event?.event).toBe('SessionIdentityAmbiguous');
    else expect(event).toBeUndefined();
  }
  expect(store.get(id).agentSessionId).toBe('the-sessions-own');
  expect(existsSync(join(dir, 'events'))).toBe(agent === 'codex');
});

// Codex runs no SessionEnd at /clear: it ends the old thread once that idles, about 60 s later
// (#302), so the new thread's SessionStart can come before or after the old one's SessionEnd.
test.each([
  ['after', true],
  ['before', false],
])(
  'Codex clear %s the old SessionEnd records a stale identity, claiming nothing',
  (_, endFirst) => {
    const { store, id, deps, log } = setUp();
    store.update(id, { agent: 'codex', agentSessionId: 'before-clear' });
    const hook = (payload: object) =>
      recordHookEvent(deps, {
        agent: 'codex',
        mesaSessionId: id,
        payload: JSON.stringify(payload),
      });
    const end = () =>
      hook({ session_id: 'before-clear', hook_event_name: 'SessionEnd', reason: 'other' });
    if (endFirst) end();
    expect(
      hook({ session_id: 'after-clear', hook_event_name: 'SessionStart', source: 'clear' }),
    ).toMatchObject({ event: 'SessionIdentityChanged', agentSessionId: 'after-clear' });
    // The new conversation's own events are not the record's.
    expect(hook({ session_id: 'after-clear', hook_event_name: 'Stop' })).toBeUndefined();
    if (!endFirst) expect(end()).toMatchObject({ event: 'SessionEnd' });
    expect(store.get(id).agentSessionId).toBe('before-clear');
    expect(log().map((event) => event.event)).toEqual(
      endFirst
        ? ['SessionEnd', 'SessionIdentityChanged']
        : ['SessionIdentityChanged', 'SessionEnd'],
    );
  },
);
