import type { MesaContext } from '../context.js';
import { brokerUrl } from '../sources/broker.js';
import { macPairingStore } from './mac-pairing.js';
import { type PairingDeps, pairingStatus, startPairing, unpair } from './pair.js';
import { pairingClient } from './protocol/client.js';
import { pairingQr } from './qr.js';

/** The profile's Pairing with a phone (CONTEXT.md, Pairing; ADR-0014's 2026-11-11 amendment). */
export function phoneService(ctx: MesaContext) {
  const deps: PairingDeps = {
    store: macPairingStore(ctx.secretStore, ctx.profile),
    client: (broker) => pairingClient(ctx.http, broker),
    clock: ctx.clock,
  };
  return {
    /** Opens a pairing and returns its QR; the receipt names only the pairing id. */
    pair: () => {
      ctx.open();
      return ctx.record(
        {
          kind: 'phone',
          summary: () => 'Started pairing a phone',
          failure: 'Could not start pairing a phone',
          inputs: {},
          outputs: (r) => ({ phone: r.pairingId }),
        },
        async () => {
          const started = await startPairing(deps, brokerUrl(ctx.env));
          return { ...started, ...pairingQr(started.qr) };
        },
      );
    },
    status: () => {
      ctx.open();
      return pairingStatus(deps);
    },
    unpair: () => {
      ctx.open();
      return ctx.record(
        {
          kind: 'phone',
          summary: () => 'Unpaired the phone',
          failure: 'Could not unpair the phone',
          inputs: {},
          outputs: (r) => ({ phone: r.pairingId }),
          changed: (r) => r.unpaired,
        },
        () => unpair(deps),
      );
    },
  };
}
