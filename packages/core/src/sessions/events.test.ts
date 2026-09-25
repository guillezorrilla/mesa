import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { fixedClock, newSession, sequentialIds, tempDir } from '../testing.js';
import { recordHookEvent } from './events.js';
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
  const store = sessionStore({ dir, newId: sequentialIds() });
  const { id } = store.create(() => newSession());
  const deps = {
    store,
    eventsDir: join(dir, 'events'),
    clock: fixedClock(),
    home,
    secrets: ['sk-conf-9876'],
  };
  const log = () =>
    readFileSync(join(dir, 'events', `${id}.jsonl`), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
  return { store, id, deps, dir, log };
}

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
