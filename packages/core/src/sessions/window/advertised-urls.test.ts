import { expect, test } from 'vitest';
import {
  lockDeps,
  newSession,
  plantOutputLog,
  profilePaths,
  scriptedRunner,
  tempDir,
  testStore,
} from '../../testing/index.js';
import { advertisedIn, advertisedUrls } from './advertised-urls.js';
import { listeningIn } from './listening-ports.js';

const VITE = '  \x1b[32m➜\x1b[39m  Local:   http://localhost:5173/';
const NEXT = 'ready - started server on 0.0.0.0:3000, url: http://localhost:3000';

test('local URLs with a port are found, the newest per port, and a public one is left out', () => {
  expect(
    advertisedIn([
      '  Local:   http://localhost:5173/',
      NEXT,
      'Serving on http://0.0.0.0:3000/app.',
      'LAN: http://192.168.1.20:8080',
      'Docs at https://example.com:8443/guide and http://172.32.0.1:9000',
      'IPv6: http://[::1]:4000/x',
      'no port: http://localhost/, nor a port too long: http://localhost:300012/',
      '  Local:   http://localhost:5174/',
      '  Network: http://192.168.1.20:5174/',
      'Serving HTTP on :: port 8000 (http://[::]:8000/) ...',
    ]),
  ).toEqual([
    { url: 'http://localhost:3000/app', host: 'localhost', port: 3000 },
    { url: 'http://[::1]:4000/x', host: '[::1]', port: 4000 },
    { url: 'http://localhost:5173/', host: 'localhost', port: 5173 },
    // The LAN address a dev server prints after its local one never replaces it.
    { url: 'http://localhost:5174/', host: 'localhost', port: 5174 },
    { url: 'http://localhost:8000/', host: 'localhost', port: 8000 },
    { url: 'http://192.168.1.20:8080/', host: '192.168.1.20', port: 8080 },
  ]);
});

test('lsof -Fpn lines give the listening ports', () => {
  expect([...listeningIn('p812\nn127.0.0.1:5173\nn*:3000\np900\nn[::1]:4000\n')]).toEqual([
    5173, 3000, 4000,
  ]);
});

/** Two unended sessions with logs, one ended, and one with none; lsof as `lsof` answers. */
function setUp(lsof: Parameters<typeof scriptedRunner>[1] = {}) {
  const home = tempDir();
  const store = testStore(home);
  const vite = store.create(() => newSession({ name: 'harbour ui' }));
  const next = store.create(() => newSession({ agentName: 'tide api' }));
  const ended = store.create(() => newSession({ endedAt: '2026-09-24T13:00:00.000Z' }));
  store.create(() => newSession());
  plantOutputLog(home, vite.id, `${VITE}\n`);
  plantOutputLog(home, next.id, `${NEXT}\n`);
  plantOutputLog(home, ended.id, 'http://localhost:6006\n');
  const { run, calls } = scriptedRunner({ lsof: 'p812\nn127.0.0.1:3000\n' }, lsof);
  const deps = { lock: lockDeps(), run, logs: profilePaths(home, 'default').logs };
  return { deps, store, vite, next, ended, calls };
}

test('each unended session lists what its log advertised, with one lsof, listening first', async () => {
  const { deps, store, vite, next, calls } = setUp();
  const unended = store.list().filter((record) => !record.endedAt);
  expect(await advertisedUrls(deps, unended)).toEqual([
    {
      session: next.id,
      sessionName: 'tide api',
      url: 'http://localhost:3000/',
      host: 'localhost',
      port: 3000,
      listening: true,
    },
    {
      session: vite.id,
      sessionName: 'harbour ui',
      url: 'http://localhost:5173/',
      host: 'localhost',
      port: 5173,
      listening: false,
    },
  ]);
  expect(calls.map((call) => [call.file, ...call.args])).toEqual([
    ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'],
  ]);
});

test('lsof missing leaves listening null; lsof finding nothing listening is false', async () => {
  const failing = setUp({ missing: ['lsof'] });
  expect(await advertisedUrls(failing.deps, [failing.vite])).toMatchObject([
    { port: 5173, listening: null },
  ]);
  const none = setUp();
  // lsof exits 1 with no output when nothing listens.
  const deps = {
    ...none.deps,
    run: async () => ({
      ok: false as const,
      reason: 'failed' as const,
      detail: 'exit 1',
      output: '',
    }),
  };
  expect(await advertisedUrls(deps, [none.vite, none.ended])).toMatchObject([
    { port: 5173, listening: false },
    { port: 6006, listening: false },
  ]);
});
