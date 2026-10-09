import { afterEach, expect, test, vi } from 'vitest';
import { type Env, handle, type Upstream } from './broker.js';

const ENV: Env = {
  ATLASSIAN_CLIENT_ID: 'client-1',
  ATLASSIAN_CLIENT_SECRET: 'secret-1',
  NOTION_CLIENT_ID: 'notion-client',
  NOTION_CLIENT_SECRET: 'notion-secret',
};
const BROKER = 'https://broker.example.test';

/** A vendor token endpoint that records each request and answers `status` with `body`. */
function vendor(status = 200, body: unknown = { access_token: 'at-1', refresh_token: 'rt-1' }) {
  const calls: { url: string; body: unknown; authorization?: string | null }[] = [];
  const upstream: Upstream = async (url, init) => {
    const authorization = new Headers(init.headers).get('authorization');
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      ...(authorization ? { authorization } : {}),
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

test('an unknown source is 404 and reaches no vendor', async () => {
  const { upstream, calls } = vendor();
  for (const answer of [
    await get('/authorize/linear?state=n1.49152'),
    await get('/callback/linear?code=c1&state=n1.49152'),
    await post('/token/linear', { grant_type: 'authorization_code', code: 'c1' }, upstream),
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
