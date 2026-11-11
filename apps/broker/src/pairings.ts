import { callerKey, type Limit } from './limit.js';
import { randomToken } from './pairing.js';

/** How the Worker reaches pairings: a Durable Object per id, and a limit on new ones per caller. */
export type PairingsDeps = {
  stub: (pairingId: string) => { fetch: (request: Request) => Promise<Response> };
  limit: Limit;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const OPS = new Set(['', 'join', 'messages', 'ack', 'socket']);

/**
 * `/pairings` routes: `POST /pairings` opens one under a new random id; `/pairings/<id>[/<op>]`
 * goes to that id's Pairing as `/<op>`, with the request's method, headers and body.
 */
export async function pairingsRoute(
  request: Request,
  path: string,
  deps: PairingsDeps | undefined,
): Promise<Response> {
  if (!deps) return json(500, { error: 'not_configured' });
  const [, , pairingId, op = '', extra] = path.split('/');
  if (pairingId === undefined || pairingId === '') {
    if (request.method !== 'POST') return json(404, { error: 'not_found' });
    if (!(await deps.limit(callerKey(request)))) return json(429, { error: 'rate_limited' });
    const id = randomToken(16);
    const answer = await deps
      .stub(id)
      .fetch(new Request('https://pairing/create', { method: 'POST', body: await request.text() }));
    if (answer.status !== 201) return answer;
    return json(201, { pairingId: id, ...((await answer.json()) as object) });
  }
  if (extra !== undefined || !OPS.has(op) || !/^[\w-]{16,64}$/.test(pairingId))
    return json(404, { error: 'not_found' });
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
  return deps.stub(pairingId).fetch(
    new Request(`https://pairing/${op}`, {
      method: request.method,
      headers: request.headers,
      body,
    }),
  );
}
