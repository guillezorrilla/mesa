import type { IdSource } from '../lib/ids.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { openBrowserExternal } from '../sessions/browser-address.js';
import { type SourceDeps, withBearer } from './authorized-fetch.js';
import { brokerToken } from './broker.js';
import type { CallbackListen } from './callback-listener.js';
import type { Site } from './connection.js';
import { SOURCES, type SourceId } from './sources.js';

/**
 * Signs in to `source` in the browser through the broker: the broker relays the vendor's answer
 * to a loopback listener as `state=<nonce>.<port>`, the code is exchanged, the sites are read, and
 * the connection is stored. A refused, mismatched, or failed sign-in stores nothing.
 */
export async function connectSource(
  deps: SourceDeps & { listen: CallbackListen; run: Runner; newId: IdSource },
  source: SourceId,
): Promise<Site[]> {
  const { label } = SOURCES[source];
  const listener = await deps.listen();
  const state = `${deps.newId()}.${listener.port}`;
  let query: URLSearchParams;
  try {
    await openBrowserExternal(
      `${deps.broker}/authorize/${source}?${new URLSearchParams({ state })}`,
      deps.run,
    );
    query = await listener.callback;
  } finally {
    listener.close();
  }
  if (query.get('state') !== state)
    throw new MesaError('usage', `the ${label} sign-in came back for another request; try again`);
  const refused = query.get('error');
  if (refused) throw new MesaError('usage', `${label} sign-in did not finish: ${refused}`);
  const code = query.get('code');
  if (!code) throw new MesaError('usage', `${label} sign-in came back with no code; try again`);
  const tokens = await brokerToken(deps, source, { grant_type: 'authorization_code', code });
  if (!tokens) throw new MesaError('usage', `${label} refused the sign-in code; try again`);
  if (!tokens.refreshToken)
    throw new MesaError('internal', `${label} gave no refresh token (the offline_access scope)`);
  const sites = await SOURCES[source].sites(withBearer(deps.http, tokens.accessToken));
  await deps.connections.write(source, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    sites,
    status: 'connected',
  });
  return sites;
}
