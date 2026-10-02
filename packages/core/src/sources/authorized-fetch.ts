import type { Clock } from '../lib/clock.js';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { brokerToken } from './broker.js';
import type { Connection, ConnectionStore } from './connection.js';
import { SOURCES, type SourceId } from './sources.js';

/**
 * What a source's calls need: the HTTP seam, the clock, the wait between tries, the broker, and
 * the profile's connections.
 */
export type SourceDeps = {
  http: Http;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  broker: string;
  connections: ConnectionStore;
};

/** A token this close to its expiry is refreshed before it is used. */
const EARLY_MS = 60_000;
/** How many times one call is sent while the source says it is rate limited. */
const TRIES = 3;
/** The longest wait between tries, whatever Retry-After asks. */
const MAX_WAIT_S = 60;

// Both name the source to connect in their details, which the app's Reconnect button reads.
export const notConnectedError = (source: SourceId) =>
  new MesaError(
    'not_found',
    `${SOURCES[source].label} is not connected: run mesa sources connect ${source}`,
    { connect: source },
  );

export const reconnectError = (source: SourceId) =>
  new MesaError(
    'invalid_config',
    `${SOURCES[source].label} needs reconnecting: run mesa sources connect ${source}`,
    { connect: source },
  );

/** A source asking Mesa to wait: a 429, or a 503 that says for how long. */
const limited = (response: Response) =>
  response.status === 429 || (response.status === 503 && response.headers.has('retry-after'));

/** How long to wait after try `tried` (1 on): Retry-After's seconds, else 1 s doubling. */
const waitMs = (response: Response, tried: number) => {
  const asked = Number(response.headers.get('retry-after') ?? Number.NaN);
  const seconds = Number.isFinite(asked) && asked >= 0 ? asked : 2 ** (tried - 1);
  return Math.min(seconds, MAX_WAIT_S) * 1000;
};

/** `http` with `token` as its Bearer, asking for JSON: what every call to a source's API sends. */
export const withBearer =
  (http: Http, token: string): Http =>
  (url, init) => {
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    headers.set('accept', 'application/json');
    return http(url, { ...init, headers });
  };

/**
 * The one owner of calls to a source's API: fetch-shaped, with the connection's Bearer token. An
 * expired token, or one the source answers 401 to, refreshes once through the broker and the
 * rotated refresh token is stored; a refused refresh, or a 401 after one, marks the connection
 * needs-reconnect and throws. A rate-limited call (a 429, or a 503 with Retry-After) waits as
 * Retry-After asks (at most MAX_WAIT_S) and is sent again, TRIES times in all, then throws.
 */
export function authorizedFetch(deps: SourceDeps, source: SourceId): Http {
  let refreshing: Promise<Connection> | undefined;
  const needsReconnect = async (connection: Connection) => {
    await deps.connections.write(source, { ...connection, status: 'needs-reconnect' });
    return reconnectError(source);
  };
  const refresh = (connection: Connection) => {
    refreshing ??= (async () => {
      // Another call may have refreshed since this one read: its refresh token was rotated away.
      const stored = await deps.connections.read(source);
      if (stored?.status === 'connected' && stored.accessToken !== connection.accessToken)
        return stored;
      const tokens = await brokerToken(deps, source, {
        grant_type: 'refresh_token',
        refresh_token: connection.refreshToken,
      });
      if (!tokens) throw await needsReconnect(connection);
      const next: Connection = {
        ...connection,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? connection.refreshToken,
        expiresAt: tokens.expiresAt,
      };
      await deps.connections.write(source, next);
      return next;
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  };
  return async (url, init) => {
    let connection = await deps.connections.read(source);
    if (!connection) throw notConnectedError(source);
    if (connection.status === 'needs-reconnect') throw reconnectError(source);
    const call = async (token: string) => {
      for (let tried = 1; ; tried++) {
        const response = await withBearer(deps.http, token)(url, init);
        if (!limited(response)) return response;
        if (tried === TRIES) {
          throw new MesaError(
            'internal',
            `${SOURCES[source].label} is rate limiting Mesa (HTTP ${response.status} ${TRIES} times): try again in a minute`,
          );
        }
        await deps.sleep(waitMs(response, tried));
      }
    };
    let refreshed = false;
    if (Date.parse(connection.expiresAt) - EARLY_MS <= deps.clock().getTime()) {
      connection = await refresh(connection);
      refreshed = true;
    }
    const response = await call(connection.accessToken);
    if (response.status !== 401) return response;
    if (refreshed) throw await needsReconnect(connection);
    connection = await refresh(connection);
    const again = await call(connection.accessToken);
    if (again.status === 401) throw await needsReconnect(connection);
    return again;
  };
}
