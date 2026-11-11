// The broker's pairing routes (ADR-0014's 2026-11-11 amendment), as both sides call them. Each
// takes a fetch-shaped function, so the Mac passes MesaDeps.http and the phone its own fetch.

/** Fetch-shaped, as MesaDeps.http is. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** A box waiting for this side, in the order the broker took them. */
export type Delivery = { id: number; box: string; at: string };

/** The broker's answer about a pairing. */
export type PairingInfo = {
  createdAt: string;
  expiresAt: string;
  joinedAt?: string;
  /** The phone's X25519 public key, once it joined. */
  phoneKey?: string;
  macSeenAt?: string;
  phoneSeenAt?: string;
};

/** A broker answer that is not a success: its HTTP status and the error it named. */
export class PairingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`the broker answered ${status} ${code}`);
  }
}

const NETWORK = 0;

export function pairingClient(fetch: Fetch, broker: string) {
  const call = async <T>(path: string, init: RequestInit & { token?: string } = {}) => {
    const { token, ...rest } = init;
    const response = await fetch(`${broker}${path}`, {
      ...rest,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }).catch(() => undefined);
    if (!response) throw new PairingError(NETWORK, 'unreachable');
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw new PairingError(response.status, String(body.error ?? 'failed'));
    return body as T;
  };
  const at = (pairingId: string) => `/pairings/${encodeURIComponent(pairingId)}`;
  return {
    /** The Mac opens a pairing, naming only the hash of the QR's secret. */
    create: (joinHash: string) =>
      call<{ pairingId: string; macToken: string; expiresAt: string }>('/pairings', {
        method: 'POST',
        body: JSON.stringify({ joinHash }),
      }),
    /** The phone joins with the secret's hash and its public key, once, before the QR expires. */
    join: (pairingId: string, joinHash: string, phoneKey: string) =>
      call<{ phoneToken: string }>(`${at(pairingId)}/join`, {
        method: 'POST',
        body: JSON.stringify({ joinHash, phoneKey }),
      }),
    state: (pairingId: string, token: string) => call<PairingInfo>(at(pairingId), { token }),
    send: (pairingId: string, token: string, box: string) =>
      call<{ id: number }>(`${at(pairingId)}/messages`, {
        method: 'POST',
        token,
        body: JSON.stringify({ box }),
      }),
    receive: async (pairingId: string, token: string) =>
      (await call<{ messages: Delivery[] }>(`${at(pairingId)}/messages`, { token })).messages,
    /** Forgets every box for this side up to and including `upTo`. */
    ack: (pairingId: string, token: string, upTo: number) =>
      call<object>(`${at(pairingId)}/ack`, {
        method: 'POST',
        token,
        body: JSON.stringify({ upTo }),
      }),
    remove: (pairingId: string, token: string) =>
      call<object>(at(pairingId), { method: 'DELETE', token }),
  };
}

export type PairingClient = ReturnType<typeof pairingClient>;
