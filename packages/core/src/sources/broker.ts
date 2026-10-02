import { z } from 'zod';
import type { Env } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { SourceDeps } from './authorized-fetch.js';

/** Mesa's hosted broker (ADR-0014). Self-hosting is MESA_BROKER_URL. */
export const DEFAULT_BROKER_URL = 'https://mesa-broker.guillecoto94.workers.dev';

export const brokerUrl = (env: Env) =>
  (env.MESA_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');

export type Grant =
  | { grant_type: 'authorization_code'; code: string }
  | { grant_type: 'refresh_token'; refresh_token: string };

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

/**
 * The OAuth errors that mean the vendor refused this grant, so the person must sign in again:
 * `invalid_grant` (expired, or already used), and `unauthorized_client`, which Atlassian answers a
 * refresh token of an app the person revoked with.
 */
const REFUSED = ['invalid_grant', 'unauthorized_client'];

/**
 * Exchanges a code or refreshes a token through the broker, which adds the client secret. The
 * new tokens, with `refreshToken` only when the vendor rotated it; undefined when the vendor
 * refused the grant (REFUSED).
 */
export async function brokerToken(
  { http, broker, clock }: Pick<SourceDeps, 'http' | 'broker' | 'clock'>,
  source: string,
  grant: Grant,
) {
  const now = clock();
  let response: Response;
  try {
    response = await http(`${broker}/token/${source}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(grant),
    });
  } catch (error) {
    throw new MesaError('internal', `cannot reach the broker at ${broker}: ${String(error)}`);
  }
  const body: unknown = await response.json().catch(() => undefined);
  const error = z.object({ error: z.string() }).safeParse(body);
  if (!response.ok) {
    if (error.success && REFUSED.includes(error.data.error)) return undefined;
    const why = error.success ? error.data.error : `HTTP ${response.status}`;
    throw new MesaError('internal', `the broker could not get a ${source} token: ${why}`);
  }
  const tokens = tokenSchema.safeParse(body);
  if (!tokens.success) throw new MesaError('internal', `the broker answered an unexpected token`);
  return {
    accessToken: tokens.data.access_token,
    refreshToken: tokens.data.refresh_token,
    expiresAt: new Date(now.getTime() + tokens.data.expires_in * 1000).toISOString(),
  };
}
