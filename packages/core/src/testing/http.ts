import type { Http } from '../lib/http.js';
import type { CallbackListen } from '../sources/callback-listener.js';

/** One request fakeHttp saw, its header names lowercase. */
export type FakeRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};
type FakeAnswer = { status?: number; headers?: Record<string, string> } & (
  | { body: unknown }
  | { html: string }
  | { bytes: Uint8Array<ArrayBuffer> }
);

/**
 * HTTP answered from `routes` by `<METHOD> <url>`, a JSON body each (or an HTML page or bytes), or a
 * function of the request; any other request is a 404. Every request is recorded, and `routes` may
 * change mid-test.
 */
export function fakeHttp(
  routes: Record<string, FakeAnswer | ((request: FakeRequest) => FakeAnswer)> = {},
) {
  const requests: FakeRequest[] = [];
  const http: Http = async (url, init) => {
    const request: FakeRequest = {
      method: init?.method ?? 'GET',
      url,
      headers: Object.fromEntries(new Headers(init?.headers)),
      ...(init?.body === undefined ? {} : { body: String(init.body) }),
    };
    requests.push(request);
    const route = routes[`${request.method} ${url}`];
    const answer = typeof route === 'function' ? route(request) : route;
    const status = answer ? (answer.status ?? 200) : 404;
    const headers = answer?.headers ?? {};
    if (answer && 'bytes' in answer) return new Response(answer.bytes, { status, headers });
    if (answer && 'html' in answer) {
      return new Response(answer.html, {
        status,
        headers: { 'content-type': 'text/html', ...headers },
      });
    }
    return new Response(JSON.stringify(answer ? answer.body : { error: 'not_found' }), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  };
  return { http, requests, routes };
}

/**
 * A person signing in: `open` is the runner's `/usr/bin/open`, which, given the broker's
 * authorize URL, comes back to `listen`'s listener (port 49152) as the broker's callback would,
 * with `answer(state)` as its query: a code and the same state unless told otherwise.
 */
export function fakeSignIn(
  answer: (state: string) => Record<string, string> = (state) => ({ code: 'code-1', state }),
) {
  let deliver: ((query: URLSearchParams) => void) | undefined;
  const world = { opened: [] as string[], closed: 0 };
  const listen: CallbackListen = async () => ({
    port: 49152,
    callback: new Promise((resolve) => {
      deliver = resolve;
    }),
    close: () => void world.closed++,
  });
  const open = (args: string[]) => {
    const url = args[0] ?? '';
    world.opened.push(url);
    deliver?.(new URLSearchParams(answer(new URL(url).searchParams.get('state') ?? '')));
    return '';
  };
  return Object.assign(world, { listen, open });
}
