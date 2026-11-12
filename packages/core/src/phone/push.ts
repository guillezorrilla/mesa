// Pushes to the paired phone (#1016): a session's question, permission or finished notice, sealed
// so the broker sends it without reading it (ADR-0014's 2026-11-11 amendment).

import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { InboxItem } from '../notifications/inbox-items.js';
import type { Config } from '../profile/config.js';
import { isAway } from './away.js';
import { macKeys } from './mac-pairing.js';
import { brokerError, type PairingDeps } from './pair.js';
import { PairingError } from './protocol/client.js';
import { type Notice, type NoticeKind, sealNotice } from './protocol/notice.js';

export type PushDeps = PairingDeps & {
  run: Runner;
  settings: () => Config['phone'];
  /** Claims the notices since then no push decided on yet (the Inbox's claimPushes). */
  claim: (since: string) => InboxItem[];
  /** What the phone shows for a notice. */
  noticeOf: (item: InboxItem) => Notice;
};

export type PushOutcome = {
  status: 'off' | 'none' | 'unpaired' | 'at-desk' | 'pushed' | 'failed';
  pushed: string[];
  /** Notices whose push failed: still in the Inbox, never tried again. */
  failed: { id: string; error: string }[];
};

/** How old a notice may be and still go out, so no backlog follows a restart or a new pairing. */
export const PUSH_WINDOW_MS = 10 * 60_000;

const outcome = (status: PushOutcome['status'], rest: Partial<PushOutcome> = {}): PushOutcome => ({
  status,
  pushed: [],
  failed: [],
  ...rest,
});

const failure = (error: unknown) =>
  error instanceof PairingError ? `${error.status} ${error.code}` : String(error);

/**
 * Pushes each new notice once when the profile is paired and `phone.push` allows it now: `always`,
 * or `away` while the Mac is idle or locked. A notice claimed while at the desk is never pushed
 * later; a push that fails is not tried again, and the notice stays in the Inbox either way.
 */
export async function pushPending(deps: PushDeps): Promise<PushOutcome> {
  const { push: mode, awayAfter } = deps.settings();
  if (mode === 'never') return outcome('off');
  const items = deps.claim(new Date(deps.clock().getTime() - PUSH_WINDOW_MS).toISOString());
  if (!items.length) return outcome('none');
  const pairing = await deps.store.read();
  if (!pairing?.phoneKey) return outcome('unpaired');
  const fresh = items.filter((item) => item.at >= (pairing.pairedAt ?? ''));
  if (!fresh.length) return outcome('none');
  if (mode === 'away' && !(await isAway(deps.run, awayAfter))) return outcome('at-desk');
  const client = deps.client(pairing.broker);
  const keys = macKeys({ ...pairing, phoneKey: pairing.phoneKey });
  const pushed: string[] = [];
  const failed: PushOutcome['failed'] = [];
  // Oldest first, so the newest lands on top of the phone's list.
  for (const item of [...fresh].reverse()) {
    const kind: NoticeKind = item.kind === 'finished' ? 'finished' : 'input';
    await client
      .push(pairing.pairingId, pairing.macToken, kind, sealNotice(keys, deps.noticeOf(item)))
      .then(
        () => pushed.push(item.id),
        (error) => failed.push({ id: item.id, error: failure(error) }),
      );
  }
  return outcome(failed.length ? 'failed' : 'pushed', { pushed, failed });
}

/** Pushes a sealed test notice now, whatever the idle time, and returns the broker's answer. */
export async function pushTest(deps: PairingDeps) {
  const pairing = await deps.store.read();
  if (!pairing?.phoneKey)
    throw new MesaError('usage', 'this profile is not paired with a phone; mesa phone pair first');
  const notice = sealNotice(macKeys({ ...pairing, phoneKey: pairing.phoneKey }), {
    title: 'Mesa',
    body: 'Pushes from this Mac reach your phone',
  });
  const answer = await deps
    .client(pairing.broker)
    .push(pairing.pairingId, pairing.macToken, 'input', notice)
    .catch((error) => {
      if (error instanceof PairingError && error.code === 'no_device')
        throw new MesaError(
          'usage',
          'the phone has not allowed notifications yet: open Mesa on it',
        );
      return brokerError(error, pairing.broker);
    });
  return { pairingId: pairing.pairingId, ...answer };
}
