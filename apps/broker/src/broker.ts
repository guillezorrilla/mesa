import { PRIVACY, TERMS } from './pages.js';
import { PROVIDERS, type Provider } from './providers.js';

/** The Worker's secrets and variables. */
export type Env = Record<string, string | undefined>;
/** How the broker reaches a vendor: the Worker's fetch, or a fake in tests. */
export type Upstream = (url: string, init: RequestInit) => Promise<Response>;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** The loopback port a callback's `state` (`<nonce>.<port>`) names, or undefined when it names none. */
function loopbackPort(state: string | null) {
  const port = state?.split('.').at(-1);
  if (!state?.includes('.') || !port || !/^\d+$/.test(port)) return undefined;
  const n = Number(port);
  return n >= 1024 && n <= 65535 ? n : undefined;
}

/** The token request's body, or undefined when it is not one of the two grants. */
function grant(body: unknown) {
  if (typeof body !== 'object' || body === null) return undefined;
  const { grant_type, code, refresh_token } = body as Record<string, unknown>;
  if (grant_type === 'authorization_code' && typeof code === 'string' && code)
    return { grant_type, code };
  if (grant_type === 'refresh_token' && typeof refresh_token === 'string' && refresh_token)
    return { grant_type, refresh_token };
  return undefined;
}

/**
 * The broker (ADR-0014): sends the browser to a vendor's sign-in, relays the vendor's answer to
 * Mesa's loopback listener, and exchanges or refreshes tokens with the client secret only it holds.
 * It never logs a request or response body. It also serves the privacy policy and terms.
 */
export async function handle(request: Request, env: Env, upstream: Upstream): Promise<Response> {
  const url = new URL(request.url);
  const pages: Record<string, string> = { '/privacy': PRIVACY, '/terms': TERMS };
  if (request.method === 'GET' && Object.hasOwn(pages, url.pathname))
    return new Response(pages[url.pathname], {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  const [, route, source = '', extra] = url.pathname.split('/');
  if (extra !== undefined || !['authorize', 'callback', 'token'].includes(route ?? ''))
    return json(404, { error: 'not_found' });
  const provider: Provider | undefined = Object.hasOwn(PROVIDERS, source)
    ? PROVIDERS[source]
    : undefined;
  if (!provider) return json(404, { error: 'unknown_source' });
  const redirectUri = `${url.origin}/callback/${source}`;

  if (route === 'callback' && request.method === 'GET') {
    const port = loopbackPort(url.searchParams.get('state'));
    if (!port) return json(400, { error: 'bad_state' });
    return Response.redirect(`http://127.0.0.1:${port}/callback${url.search}`, 302);
  }

  const clientId = env[provider.env.clientId];
  const clientSecret = env[provider.env.clientSecret];
  if (!clientId || !clientSecret) return json(500, { error: 'not_configured' });

  if (route === 'authorize' && request.method === 'GET') {
    const state = url.searchParams.get('state');
    if (!state) return json(400, { error: 'missing_state' });
    const to = new URL(provider.authorizeUrl);
    to.search = new URLSearchParams({
      client_id: clientId,
      ...(provider.scopes ? { scope: provider.scopes } : {}),
      redirect_uri: redirectUri,
      state,
      ...provider.params,
    }).toString();
    return Response.redirect(to.toString(), 302);
  }

  if (route === 'token' && request.method === 'POST') {
    const body = grant(await request.json().catch(() => undefined));
    if (!body) return json(400, { error: 'bad_request' });
    const answer = await upstream(provider.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        ...body,
        client_id: clientId,
        client_secret: clientSecret,
        ...(body.grant_type === 'authorization_code' ? { redirect_uri: redirectUri } : {}),
      }),
    });
    return new Response(await answer.text(), {
      status: answer.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return json(404, { error: 'not_found' });
}
