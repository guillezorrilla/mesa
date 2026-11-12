// Sends a phone its push through APNs (ADR-0014's 2026-11-11 amendment), signed with an ES256
// token from the APNS_KEY secret. The push carries a fixed alert and the sealed notice; the
// broker never opens the notice.
import type { Env, Upstream } from './broker.js';

/** What APNs did with a push: sent, the device token is dead, or another failure. */
export type PushResult =
  | { status: 'sent' }
  | { status: 'gone' }
  | { status: 'failed'; code: number; reason: string }
  | { status: 'not_configured' };
export type Pusher = (
  env: Env,
  deviceToken: string,
  alert: string,
  notice: string,
) => Promise<PushResult>;

/** Production only: TestFlight builds register with it (`aps-environment` in app.config.ts). */
const APNS = 'https://api.push.apple.com/3/device/';
/** Apple takes a token for an hour and refuses one refreshed more often than every 20 minutes. */
const TOKEN_MS = 50 * 60_000;
/** The reasons that mean the device token will never work again. */
const DEAD = new Set(['BadDeviceToken', 'Unregistered']);

const base64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

/** The PKCS#8 bytes of a .p8 file's PEM text. */
const pkcs8 = (pem: string) =>
  Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (char) => char.charCodeAt(0));

async function providerToken(env: Env, keyId: string, teamId: string, issuedAt: number) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8(env.APNS_KEY ?? ''),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const head = `${base64url(JSON.stringify({ alg: 'ES256', kid: keyId }))}.${base64url(
    JSON.stringify({ iss: teamId, iat: Math.floor(issuedAt / 1000) }),
  )}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(head),
  );
  return `${head}.${base64url(new Uint8Array(signature))}`;
}

/**
 * The APNs sender, one per isolate: the Worker's `upstream` and clock, with its provider token
 * kept for TOKEN_MS so every pairing's pushes share it.
 */
export function apnsPusher(upstream: Upstream, now: () => Date): Pusher {
  let cached: { key: string; token: string; at: number } | undefined;
  return async (env, deviceToken, alert, notice) => {
    const { APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_TOPIC } = env;
    if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_TOPIC)
      return { status: 'not_configured' };
    const at = now().getTime();
    const key = `${APNS_KEY_ID}.${APNS_TEAM_ID}`;
    if (!cached || cached.key !== key || at - cached.at >= TOKEN_MS)
      cached = { key, token: await providerToken(env, APNS_KEY_ID, APNS_TEAM_ID, at), at };
    const answer = await upstream(`${APNS}${deviceToken}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${cached.token}`,
        'apns-topic': APNS_TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        aps: { alert, 'mutable-content': 1, sound: 'default' },
        n: notice,
      }),
    }).catch(() => undefined);
    if (!answer) return { status: 'failed', code: 0, reason: 'unreachable' };
    if (answer.ok) return { status: 'sent' };
    const reason = String(
      ((await answer.json().catch(() => ({}))) as { reason?: unknown }).reason ?? 'failed',
    );
    if (DEAD.has(reason) || answer.status === 410) return { status: 'gone' };
    // A token APNs calls expired is made again on the next push.
    if (reason === 'ExpiredProviderToken') cached = undefined;
    return { status: 'failed', code: answer.status, reason };
  };
}
