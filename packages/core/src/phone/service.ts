import { join } from 'node:path';
import type { MesaContext } from '../context.js';
import { launchAgent } from '../lib/launch-agent.js';
import { MesaError } from '../lib/result.js';
import { brokerUrl } from '../sources/broker.js';
import { macPairingStore } from './mac-pairing.js';
import { type PairingDeps, pairingStatus, startPairing, unpair } from './pair.js';
import { pairingClient } from './protocol/client.js';
import { type PushDeps, pushPending, pushTest } from './push.js';
import { pairingQr } from './qr.js';
import type { AnswerDeps } from './serve/answer.js';
import type { SessionSteer } from './serve/answer-steer.js';
import { servePhone } from './serve/listen.js';
import { phoneQueue } from './serve/queue.js';

/**
 * The profile's Pairing with a phone (CONTEXT.md, Pairing; ADR-0014's 2026-11-11 amendment), and
 * its pushes of the Inbox's notices (`pushes`, the Inbox's pendingPushes and claimPushes), and
 * the listener that answers it through `answers`, the session functions the CLI uses.
 */
export function phoneService(
  ctx: MesaContext,
  pushes: Pick<PushDeps, 'pending' | 'claim'>,
  answers: Omit<AnswerDeps, 'steer'> & { steer: SessionSteer },
) {
  const agent = launchAgent(ctx, {
    name: 'phone',
    what: 'phone listener',
    command: ['phone', 'serve'],
    run: 'keep-alive',
    log: 'phone',
  });
  /** The phone's queued replies (CONTEXT.md, Queued message): the listener's, and the Mac's to list. */
  const queue = phoneQueue({
    file: join(ctx.paths.root, 'phone-queue.json'),
    lock: ctx,
    clock: ctx.clock,
    newId: ctx.newId,
  });
  const deps: PairingDeps = {
    store: macPairingStore(ctx.secretStore, ctx.profile),
    client: (broker) => pairingClient(ctx.http, broker),
    clock: ctx.clock,
    listener: {
      ensure: async () =>
        agent.exists() ? (await agent.start()).loaded : (await agent.install()).loaded,
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
    /** Pushes the new session notices to the phone when `phone.push` allows it now (#1016). */
    push: () =>
      pushPending({
        ...deps,
        run: ctx.run,
        settings: ctx.open().config.phone,
        ...pushes,
        projectOf: (session) => ctx.store.find(session)?.project ?? null,
      }),
    /** Pushes a sealed test notice now, whatever the idle time. */
    pushTest: () => {
      ctx.open();
      return pushTest(deps);
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
          answers: {
            ...answers,
            steer: { ...answers.steer, queue },
          },
          lock: ctx,
          lockPath: join(ctx.paths.root, 'phone-listener.lock'),
        },
        stop,
      );
    },
    /**
     * The replies the phone queued for busy sessions (`mesa queue`, and under the desktop's
     * composer), all or session `id`'s; removing one the listener already typed is not_found.
     */
    queue: {
      list: (id?: string) => {
        ctx.open();
        return queue.list(id);
      },
      remove: (id: string) => {
        ctx.open();
        if (!queue.remove(id))
          throw new MesaError(
            'not_found',
            `queued message ${id} is no longer queued: the listener typed it, or it was removed`,
          );
        return { id, removed: true as const };
      },
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
