import { afterEach, expect, test, vi } from 'vitest';
import { type Env, handle, type Upstream } from './broker.js';
import type { Limit } from './feedback.js';
import { type D1, d1Installs, type Installs } from './installs.js';

const ENV: Env = {
  ATLASSIAN_CLIENT_ID: 'client-1',
  ATLASSIAN_CLIENT_SECRET: 'secret-1',
  NOTION_CLIENT_ID: 'notion-client',
  NOTION_CLIENT_SECRET: 'notion-secret',
  CLICKUP_CLIENT_ID: 'clickup-client',
  CLICKUP_CLIENT_SECRET: 'clickup-secret',
  LINEAR_CLIENT_ID: 'linear-client',
  LINEAR_CLIENT_SECRET: 'linear-secret',
  GITHUB_CLIENT_ID: 'github-client',
  GITHUB_CLIENT_SECRET: 'github-secret',
};
const BROKER = 'https://broker.example.test';

/**
 * A vendor token endpoint that records each request (its body read as JSON, or as a form when sent
 * as one) and answers `status` with `body`.
 */
function vendor(status = 200, body: unknown = { access_token: 'at-1', refresh_token: 'rt-1' }) {
  const calls: { url: string; body: unknown; authorization?: string | null; form?: true }[] = [];
  const upstream: Upstream = async (url, init) => {
    const headers = new Headers(init.headers);
    const authorization = headers.get('authorization');
    const form = headers.get('content-type') === 'application/x-www-form-urlencoded';
    calls.push({
      url,
      body: form
        ? Object.fromEntries(new URLSearchParams(String(init.body)))
        : JSON.parse(String(init.body)),
      ...(authorization ? { authorization } : {}),
      ...(form ? { form } : {}),
    });
    return new Response(JSON.stringify(body), { status });
  };
  return { upstream, calls };
}

const get = (path: string, env = ENV) =>
  handle(new Request(`${BROKER}${path}`), env, vendor().upstream);
const post = (path: string, body: unknown, upstream: Upstream, env = ENV) =>
  handle(
    new Request(`${BROKER}${path}`, { method: 'POST', body: JSON.stringify(body) }),
    env,
    upstream,
  );

test('authorize sends the browser to Atlassian with the client id, scopes, callback, and state', async () => {
  const answer = await get('/authorize/atlassian?state=n1.49152');
  expect(answer.status).toBe(302);
  const to = new URL(answer.headers.get('location') ?? '');
  expect(`${to.origin}${to.pathname}`).toBe('https://auth.atlassian.com/authorize');
  expect(Object.fromEntries(to.searchParams)).toEqual({
    client_id: 'client-1',
    scope:
      'read:jira-work write:jira-work read:jira-user read:board-scope:jira-software read:sprint:jira-software read:project:jira read:page:confluence read:space:confluence read:hierarchical-content:confluence search:confluence read:me offline_access',
    redirect_uri: `${BROKER}/callback/atlassian`,
    state: 'n1.49152',
    audience: 'api.atlassian.com',
    response_type: 'code',
    prompt: 'consent',
  });
  expect((await get('/authorize/atlassian')).status).toBe(400);
});

test('the callback relays the code or the error, with the state, to the loopback port', async () => {
  const code = await get('/callback/atlassian?code=c1&state=n1.49152');
  expect(code.status).toBe(302);
  expect(code.headers.get('location')).toBe(
    'http://127.0.0.1:49152/callback?code=c1&state=n1.49152',
  );
  const denied = await get('/callback/atlassian?error=access_denied&state=n1.50000');
  expect(denied.headers.get('location')).toBe(
    'http://127.0.0.1:50000/callback?error=access_denied&state=n1.50000',
  );
});

test.each(['n1', 'n1.', 'n1.80', 'n1.1023', 'n1.65536', 'n1.4915x', 'n1.-2000'])(
  'the callback refuses a state naming no loopback port: %s',
  async (state) => {
    const answer = await get(`/callback/atlassian?code=c1&state=${state}`);
    expect(answer.status).toBe(400);
    expect(answer.headers.get('location')).toBeNull();
  },
);

test('a code exchanges with the client secret and the same callback, the answer passed through', async () => {
  const { upstream, calls } = vendor(200, { access_token: 'at-1', expires_in: 3600 });
  const answer = await post(
    '/token/atlassian',
    { grant_type: 'authorization_code', code: 'c1' },
    upstream,
  );
  expect(calls).toEqual([
    {
      url: 'https://auth.atlassian.com/oauth/token',
      body: {
        grant_type: 'authorization_code',
        code: 'c1',
        client_id: 'client-1',
        client_secret: 'secret-1',
        redirect_uri: `${BROKER}/callback/atlassian`,
      },
    },
  ]);
  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({ access_token: 'at-1', expires_in: 3600 });
});

test("a refresh sends the refresh token, and the vendor's refusal comes back unchanged", async () => {
  const { upstream, calls } = vendor(403, { error: 'invalid_grant' });
  const answer = await post(
    '/token/atlassian',
    { grant_type: 'refresh_token', refresh_token: 'rt-1' },
    upstream,
  );
  expect(calls[0]?.body).toEqual({
    grant_type: 'refresh_token',
    refresh_token: 'rt-1',
    client_id: 'client-1',
    client_secret: 'secret-1',
  });
  expect(answer.status).toBe(403);
  expect(await answer.json()).toEqual({ error: 'invalid_grant' });
});

test('Notion signs in as its owner with no scopes, and takes the client secret as HTTP Basic', async () => {
  const to = new URL((await get('/authorize/notion?state=n1.49152')).headers.get('location') ?? '');
  expect(`${to.origin}${to.pathname}`).toBe('https://api.notion.com/v1/oauth/authorize');
  expect(Object.fromEntries(to.searchParams)).toEqual({
    client_id: 'notion-client',
    redirect_uri: `${BROKER}/callback/notion`,
    state: 'n1.49152',
    owner: 'user',
    response_type: 'code',
  });

  const { upstream, calls } = vendor(200, { access_token: 'at-1', refresh_token: 'rt-1' });
  await post('/token/notion', { grant_type: 'authorization_code', code: 'c1' }, upstream);
  await post('/token/notion', { grant_type: 'refresh_token', refresh_token: 'rt-1' }, upstream);
  const basic = `Basic ${btoa('notion-client:notion-secret')}`;
  expect(calls).toEqual([
    {
      url: 'https://api.notion.com/v1/oauth/token',
      body: {
        grant_type: 'authorization_code',
        code: 'c1',
        redirect_uri: `${BROKER}/callback/notion`,
      },
      authorization: basic,
    },
    {
      url: 'https://api.notion.com/v1/oauth/token',
      body: { grant_type: 'refresh_token', refresh_token: 'rt-1' },
      authorization: basic,
    },
  ]);
});

test('ClickUp signs in with no scopes, and takes the client id and secret in the JSON body', async () => {
  const to = new URL(
    (await get('/authorize/clickup?state=n1.49152')).headers.get('location') ?? '',
  );
  expect(`${to.origin}${to.pathname}`).toBe('https://app.clickup.com/api');
  expect(Object.fromEntries(to.searchParams)).toEqual({
    client_id: 'clickup-client',
    redirect_uri: `${BROKER}/callback/clickup`,
    state: 'n1.49152',
  });

  const { upstream, calls } = vendor(200, { access_token: 'at-1' });
  const answer = await post(
    '/token/clickup',
    { grant_type: 'authorization_code', code: 'c1' },
    upstream,
  );
  expect(await answer.json()).toEqual({ access_token: 'at-1' });
  expect(calls).toEqual([
    {
      url: 'https://api.clickup.com/api/v2/oauth/token',
      body: {
        grant_type: 'authorization_code',
        code: 'c1',
        client_id: 'clickup-client',
        client_secret: 'clickup-secret',
        redirect_uri: `${BROKER}/callback/clickup`,
      },
    },
  ]);
});

test('Linear asks for read and write with consent, and takes its token requests as a form', async () => {
  const to = new URL((await get('/authorize/linear?state=n1.49152')).headers.get('location') ?? '');
  expect(`${to.origin}${to.pathname}`).toBe('https://linear.app/oauth/authorize');
  expect(Object.fromEntries(to.searchParams)).toEqual({
    client_id: 'linear-client',
    scope: 'read,write',
    redirect_uri: `${BROKER}/callback/linear`,
    state: 'n1.49152',
    response_type: 'code',
    prompt: 'consent',
  });

  const token = {
    access_token: 'at-1',
    expires_in: 86399,
    refresh_token: 'rt-1',
    scope: 'read,write',
  };
  const { upstream, calls } = vendor(200, token);
  const answer = await post(
    '/token/linear',
    { grant_type: 'authorization_code', code: 'c1' },
    upstream,
  );
  expect(await answer.json()).toEqual(token);
  await post('/token/linear', { grant_type: 'refresh_token', refresh_token: 'rt-1' }, upstream);
  const client = { client_id: 'linear-client', client_secret: 'linear-secret' };
  expect(calls).toEqual([
    {
      url: 'https://api.linear.app/oauth/token',
      body: {
        grant_type: 'authorization_code',
        code: 'c1',
        ...client,
        redirect_uri: `${BROKER}/callback/linear`,
      },
      form: true,
    },
    {
      url: 'https://api.linear.app/oauth/token',
      body: { grant_type: 'refresh_token', refresh_token: 'rt-1', ...client },
      form: true,
    },
  ]);
});

test('GitHub signs in to its GitHub App with no scopes, and refreshes its 8-hour tokens as a form', async () => {
  const to = new URL((await get('/authorize/github?state=n1.49152')).headers.get('location') ?? '');
  expect(`${to.origin}${to.pathname}`).toBe('https://github.com/login/oauth/authorize');
  expect(Object.fromEntries(to.searchParams)).toEqual({
    client_id: 'github-client',
    redirect_uri: `${BROKER}/callback/github`,
    state: 'n1.49152',
  });

  const token = {
    access_token: 'ghu-1',
    expires_in: 28800,
    refresh_token: 'ghr-1',
    refresh_token_expires_in: 15897600,
    token_type: 'bearer',
    scope: '',
  };
  const { upstream, calls } = vendor(200, token);
  const answer = await post(
    '/token/github',
    { grant_type: 'authorization_code', code: 'c1' },
    upstream,
  );
  expect(await answer.json()).toEqual(token);
  await post('/token/github', { grant_type: 'refresh_token', refresh_token: 'ghr-1' }, upstream);
  const client = { client_id: 'github-client', client_secret: 'github-secret' };
  expect(calls).toEqual([
    {
      url: 'https://github.com/login/oauth/access_token',
      body: {
        grant_type: 'authorization_code',
        code: 'c1',
        ...client,
        redirect_uri: `${BROKER}/callback/github`,
      },
      form: true,
    },
    {
      url: 'https://github.com/login/oauth/access_token',
      body: { grant_type: 'refresh_token', refresh_token: 'ghr-1', ...client },
      form: true,
    },
  ]);
  // GitHub refuses a used refresh token with HTTP 200 and an error, passed back unchanged.
  const refused = vendor(200, { error: 'bad_refresh_token' });
  const again = await post(
    '/token/github',
    { grant_type: 'refresh_token', refresh_token: 'ghr-1' },
    refused.upstream,
  );
  expect([again.status, await again.json()]).toEqual([200, { error: 'bad_refresh_token' }]);
});

test('an unknown source is 404 and reaches no vendor', async () => {
  const { upstream, calls } = vendor();
  for (const answer of [
    await get('/authorize/asana?state=n1.49152'),
    await get('/callback/asana?code=c1&state=n1.49152'),
    await post('/token/asana', { grant_type: 'authorization_code', code: 'c1' }, upstream),
    await get('/authorize/toString?state=n1.49152'),
  ]) {
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ error: 'unknown_source' });
  }
  expect(calls).toEqual([]);
});

test('a missing client id or secret is 500 not_configured', async () => {
  const { upstream, calls } = vendor();
  const noSecret = { ATLASSIAN_CLIENT_ID: 'client-1' };
  const exchange = await post(
    '/token/atlassian',
    { grant_type: 'authorization_code', code: 'c1' },
    upstream,
    noSecret,
  );
  expect(exchange.status).toBe(500);
  expect(await exchange.json()).toEqual({ error: 'not_configured' });
  expect((await get('/authorize/atlassian?state=n1.49152', {})).status).toBe(500);
  expect(calls).toEqual([]);
});

test('a token request that is not one of the two grants is 400', async () => {
  const { upstream, calls } = vendor();
  for (const body of [
    { grant_type: 'authorization_code' },
    { grant_type: 'refresh_token', refresh_token: '' },
    { grant_type: 'client_credentials' },
    'not json',
  ])
    expect((await post('/token/atlassian', body, upstream)).status).toBe(400);
  const raw = new Request(`${BROKER}/token/atlassian`, { method: 'POST', body: '{' });
  expect((await handle(raw, ENV, upstream)).status).toBe(400);
  expect(calls).toEqual([]);
});

test('the privacy policy and terms are static pages', async () => {
  for (const path of ['/privacy', '/terms']) {
    const answer = await get(path);
    expect(answer.status).toBe(200);
    expect(answer.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await answer.text()).toContain('guillezorrilla');
  }
  // The policy says what the install count keeps and how to turn it off and erase it.
  const privacy = await (await get('/privacy')).text();
  expect(privacy).toContain('anonymous install ID');
  expect(privacy).toContain('mesa installs off');
});

afterEach(() => vi.restoreAllMocks());

test('no console call carries the code, a token, or the secret across exchange, refresh, and callback', async () => {
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((name) =>
    vi.spyOn(console, name).mockImplementation(() => {}),
  );
  const { upstream } = vendor(200, { access_token: 'at-1', refresh_token: 'rt-2' });
  await get('/callback/atlassian?code=c1&state=n1.49152');
  await post('/token/atlassian', { grant_type: 'authorization_code', code: 'c1' }, upstream);
  await post('/token/atlassian', { grant_type: 'refresh_token', refresh_token: 'rt-1' }, upstream);
  const said = spies.flatMap((spy) => spy.mock.calls.map((args) => JSON.stringify(args)));
  for (const secret of ['c1', 'at-1', 'rt-1', 'rt-2', 'secret-1'])
    expect(said.filter((line) => line.includes(secret))).toEqual([]);
});

const FEEDBACK = {
  message: 'The board\nloses my place',
  version: '0.2.15',
  build: '512',
  from: 'sessions',
};
const FEEDBACK_ENV: Env = { ...ENV, FEEDBACK_GITHUB_TOKEN: 'feedback-token' };
/** GitHub's issues endpoint, recording each request's URL, headers, and JSON body. */
function github(status = 201) {
  const calls: { url: string; headers: Headers; body: unknown }[] = [];
  const upstream: Upstream = async (url, init) => {
    calls.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ number: 7, html_url: 'https://github.test/7' }), {
      status,
    });
  };
  return { upstream, calls };
}
const sendFeedback = (body: unknown, upstream: Upstream, env = FEEDBACK_ENV, limit?: Limit) =>
  handle(
    new Request(`${BROKER}/feedback`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    }),
    env,
    upstream,
    limit,
  );

test('feedback opens an issue in the private repo and answers only that it did', async () => {
  const gh = github();
  const answer = await sendFeedback(FEEDBACK, gh.upstream);
  expect(answer.status).toBe(201);
  expect(await answer.json()).toEqual({});
  expect(gh.calls).toHaveLength(1);
  expect(gh.calls[0]?.url).toBe('https://api.github.com/repos/guillezorrilla/mesa-feedback/issues');
  expect(gh.calls[0]?.headers.get('authorization')).toBe('Bearer feedback-token');
  expect(gh.calls[0]?.headers.get('user-agent')).toBe('mesa-broker');
  expect(gh.calls[0]?.body).toEqual({
    title: 'The board',
    body: 'The board\nloses my place\n\n---\nMesa 0.2.15 (build 512), from sessions',
  });
});

test('feedback goes to FEEDBACK_REPO when set, and its title is cut to 70 characters', async () => {
  const gh = github();
  const long = 'x'.repeat(90);
  await sendFeedback({ ...FEEDBACK, message: `  ${long}  ` }, gh.upstream, {
    ...FEEDBACK_ENV,
    FEEDBACK_REPO: 'someone/inbox',
  });
  expect(gh.calls[0]?.url).toBe('https://api.github.com/repos/someone/inbox/issues');
  expect(gh.calls[0]?.body).toMatchObject({ title: 'x'.repeat(70) });
});

test.each([
  ['an empty message', { ...FEEDBACK, message: '   ' }],
  ['a message over 5000 characters', { ...FEEDBACK, message: 'x'.repeat(5001) }],
  ['no version', { ...FEEDBACK, version: undefined }],
  ['a from over 40 characters', { ...FEEDBACK, from: 'x'.repeat(41) }],
  ['no body', undefined],
])('feedback with %s is 400 and reaches no one', async (_, body) => {
  const gh = github();
  const answer = await sendFeedback(body, gh.upstream);
  expect(answer.status).toBe(400);
  expect(gh.calls).toHaveLength(0);
});

test('feedback with no token is 500 not_configured; a GitHub failure is 502', async () => {
  const missing = await sendFeedback(FEEDBACK, github().upstream, ENV);
  expect(missing.status).toBe(500);
  expect(await missing.json()).toEqual({ error: 'not_configured' });
  expect((await sendFeedback(FEEDBACK, github(403).upstream)).status).toBe(502);
  const down: Upstream = async () => {
    throw new Error('offline');
  };
  expect((await sendFeedback(FEEDBACK, down)).status).toBe(502);
});

test('feedback past the limit for its IP is 429 and reaches no one', async () => {
  const gh = github();
  const keys: string[] = [];
  const answer = await sendFeedback(FEEDBACK, gh.upstream, FEEDBACK_ENV, async (key) => {
    keys.push(key);
    return false;
  });
  expect(answer.status).toBe(429);
  expect(keys).toEqual(['203.0.113.9']);
  expect(gh.calls).toHaveLength(0);
});

/**
 * A D1 over Node's SQLite with the broker's migrations applied, so the store's own SQL runs.
 * Imported by name so the Worker's types need no Node ones.
 */
async function sqliteD1() {
  const [sqlite, fs] = ['node:sqlite', 'node:fs'];
  const { DatabaseSync } = await import(sqlite);
  const { readFileSync } = await import(fs);
  const db = new DatabaseSync(':memory:');
  const migration = readFileSync(
    new URL('../migrations/0001_installs.sql', import.meta.url),
    'utf8',
  );
  db.exec(migration);
  type Bound = { sql: string; values: unknown[] };
  const d1: D1 = {
    prepare: (sql) => ({ bind: (...values: unknown[]): Bound => ({ sql, values }) }),
    batch: async (statements) => {
      for (const { sql, values } of statements as Bound[]) db.prepare(sql).run(...values);
    },
  };
  const rows = (table: string): Record<string, unknown>[] =>
    db.prepare(`SELECT * FROM ${table} ORDER BY id, version`).all();
  return { d1, rows };
}

const ID = '3f6c2a9e-8b1d-4e7a-9c20-5d4b3a2f1e0c';
const OTHER = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

async function installsBroker(day = '2026-10-14T23:50:00.000Z', limit: Limit = async () => true) {
  const { d1, rows } = await sqliteD1();
  let now = new Date(day);
  const installs: Installs = { store: d1Installs(d1), limit, now: () => now };
  const send = (method: string, path: string, body?: unknown) =>
    handle(
      new Request(`${BROKER}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        headers: { 'cf-connecting-ip': '203.0.113.7' },
      }),
      ENV,
      vendor().upstream,
      undefined,
      installs,
    );
  return { send, rows, later: (at: string) => (now = new Date(at)) };
}

test('an install ping keeps the install and each version it reached, by UTC day', async () => {
  const { send, rows, later } = await installsBroker();
  const ping = (version: string) =>
    send('POST', '/installs', { id: ID, version, channel: 'stable' });
  expect((await ping('0.3.3')).status).toBe(204);
  later('2026-10-15T08:00:00.000Z');
  await ping('0.3.3');
  later('2026-10-20T08:00:00.000Z');
  const answer = await ping('0.3.4');
  expect([answer.status, await answer.text()]).toEqual([204, '']);
  expect(rows('installs')).toEqual([
    {
      id: ID,
      first_seen: '2026-10-14',
      last_seen: '2026-10-20',
      version: '0.3.4',
      channel: 'stable',
    },
  ]);
  expect(rows('install_versions')).toEqual([
    { id: ID, version: '0.3.3', first_seen: '2026-10-14' },
    { id: ID, version: '0.3.4', first_seen: '2026-10-20' },
  ]);
});

test.each([
  ['an id that is not a UUID', { id: 'mesa-1', version: '0.3.3', channel: 'stable' }],
  ['an empty version', { id: ID, version: '', channel: 'stable' }],
  ['a version over 40 characters', { id: ID, version: 'v'.repeat(41), channel: 'stable' }],
  ['another channel', { id: ID, version: '0.3.3', channel: 'nightly' }],
  ['no body', undefined],
])('an install ping with %s is 400 and keeps nothing', async (_, body) => {
  const { send, rows } = await installsBroker();
  expect((await send('POST', '/installs', body)).status).toBe(400);
  expect([rows('installs'), rows('install_versions')]).toEqual([[], []]);
});

test('erasing an install removes only its rows; a malformed id is 400', async () => {
  const { send, rows } = await installsBroker();
  for (const id of [ID, OTHER])
    await send('POST', '/installs', { id, version: '0.3.3', channel: 'beta' });
  expect((await send('DELETE', `/installs/${ID}`)).status).toBe(204);
  expect(rows('installs').map((row) => row.id)).toEqual([OTHER]);
  expect(rows('install_versions').map((row) => row.id)).toEqual([OTHER]);
  expect((await send('DELETE', '/installs/mesa-1')).status).toBe(400);
  expect((await send('GET', '/installs')).status).toBe(404);
});

test('install routes past the limit for their IP are 429; without D1 they are 503', async () => {
  const keys: string[] = [];
  const { send, rows } = await installsBroker(undefined, async (key) => {
    keys.push(key);
    return false;
  });
  expect(
    (await send('POST', '/installs', { id: ID, version: '0.3.3', channel: 'stable' })).status,
  ).toBe(429);
  expect(keys).toEqual(['203.0.113.7']);
  expect(rows('installs')).toEqual([]);
  const bare = await handle(
    new Request(`${BROKER}/installs/${ID}`, { method: 'DELETE' }),
    ENV,
    vendor().upstream,
  );
  expect([bare.status, await bare.json()]).toEqual([503, { error: 'not_configured' }]);
});
