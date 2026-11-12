import { join } from 'node:path';
import type { MesaContext } from '../context.js';
import { launchAgent } from '../lib/launch-agent.js';
import { brokerUrl } from '../sources/broker.js';
import { macPairingStore } from './mac-pairing.js';
import { type PairingDeps, pairingStatus, startPairing, unpair } from './pair.js';
import { pairingClient } from './protocol/client.js';
import { pairingQr } from './qr.js';
import type { AnswerDeps } from './serve/answer.js';
import { servePhone } from './serve/listen.js';

/**
 * The profile's Pairing with a phone (CONTEXT.md, Pairing; ADR-0014's 2026-11-11 amendment), and
 * the listener that answers it through `answers`, the session functions the CLI uses.
 */
export function phoneService(ctx: MesaContext, answers: AnswerDeps) {
  const agent = launchAgent(ctx, {
    name: 'phone',
    what: 'phone listener',
    command: ['phone', 'serve'],
    run: 'keep-alive',
    log: 'phone',
  });
  const deps: PairingDeps = {
    store: macPairingStore(ctx.secretStore, ctx.profile),
    client: (broker) => pairingClient(ctx.http, broker),
    clock: ctx.clock,
    listener: {
      ensure: async () =>
        agent.exists() ? (await agent.status()).loaded : (await agent.install()).loaded,
      remove: () => agent.uninstall(),
    },
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
    /**
     * Runs the listener in this process until `stop` aborts or the pairing ends (ADR-0027): the
     * LaunchAgent runs it with the app open or closed; one runs per profile.
     */
    serve: (stop?: AbortSignal) => {
      ctx.open();
      return servePhone(
        {
          ...deps,
          connect: ctx.connect,
          sleep: ctx.sleep,
          answers,
          lock: ctx,
          lockPath: join(ctx.paths.root, 'phone-listener.lock'),
        },
        stop,
      );
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
