import { fromBase64url } from './seal.js';

/** What the Mac's QR carries: everything the phone needs to join, and nothing the broker keeps. */
export type PairingLink = {
  /** The broker's origin, `https://...` (or `http://localhost...` in a local run). */
  broker: string;
  pairingId: string;
  /** The one-time secret: the broker holds only its hash, and the phone proves it in its hello. */
  secret: string;
  /** The Mac's X25519 public key, base64url. */
  macKey: string;
  /** What the phone calls this Mac (its computer name, and the profile when not the default). */
  name?: string;
};

/** The longest Mac name a link carries. */
const NAME_MAX = 64;

const PREFIX = 'mesa://pair';

/** The link the QR shows. */
export function formatPairingLink(link: PairingLink): string {
  const query = new URLSearchParams({
    v: '1',
    b: link.broker,
    p: link.pairingId,
    s: link.secret,
    k: link.macKey,
    ...(link.name ? { n: link.name.slice(0, NAME_MAX) } : {}),
  });
  return `${PREFIX}?${query}`;
}

const isKey = (text: string | null | undefined) => !!text && fromBase64url(text)?.length === 32;
const isBroker = (text: string | null | undefined) => {
  try {
    const url = new URL(text ?? '');
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    );
  } catch {
    return false;
  }
};

/** The link a scanned QR or pasted text holds, or undefined when it is not a version 1 link. */
export function parsePairingLink(text: string): PairingLink | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith(`${PREFIX}?`)) return undefined;
  const query = new URLSearchParams(trimmed.slice(PREFIX.length + 1));
  const [broker, pairingId, secret, macKey] = ['b', 'p', 's', 'k'].map((key) => query.get(key));
  if (
    query.get('v') !== '1' ||
    !isBroker(broker) ||
    !pairingId ||
    !/^[\w-]{16,64}$/.test(pairingId)
  )
    return undefined;
  if (!isKey(secret) || !isKey(macKey)) return undefined;
  const name = query.get('n')?.trim().slice(0, NAME_MAX);
  return {
    broker: new URL(broker as string).origin,
    pairingId,
    secret: secret as string,
    macKey: macKey as string,
    ...(name ? { name } : {}),
  };
}
