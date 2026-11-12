// Pushes to the paired phone (#1016): a session's question, permission or finished notice, sealed
// so the broker sends it without reading it (ADR-0014's 2026-11-11 amendment).

import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { InboxItem } from '../notifications/inbox-items.js';
import type { Config } from '../profile/config.js';
import { projectLabel } from '../sessions/record/general.js';
import { isAway } from './away.js';
import { macKeys } from './mac-pairing.js';
import { brokerError, type PairingDeps } from './pair.js';
import { PairingError } from './protocol/client.js';
import { type NoticeKind, sealNotice } from './protocol/notice.js';

export type PushDeps = PairingDeps & {
  run: Runner;
  settings: Config['phone'];
  /** The question, permission, approval and finished notices since then that no push took yet. */
  pending: (since: string) => InboxItem[];
  /** Takes these notices for a push, returning the ones no other process took first. */
  claim: (ids: string[]) => string[];
  /** A session's project, for the notice's body. */
  projectOf: (session: string) => string | null;
};

export type PushOutcome = {
  status: 'off' | 'none' | 'unpaired' | 'at-desk' | 'pushed' | 'failed';
  pushed: string[];
  /** Notices whose push failed: still in the Inbox, never tried again. */
  failed: { id: string; error: string }[];
};

/**
 * How much older than `phone.awayAfter` a notice may be and still go out: a question asked just
 * before the person left is pushed once they count as away, and no backlog follows a restart.
 */
export const PUSH_WINDOW_MS = 10 * 60_000;

const outcome = (status: PushOutcome['status'], rest: Partial<PushOutcome> = {}): PushOutcome => ({
  status,
  pushed: [],
  failed: [],
  ...rest,
});

const failure = (error: unknown) =>
  error instanceof PairingError
    ? `${error.status} ${error.code}${error.reason ? ` (${error.reason})` : ''}`
    : String(error);

/** The profile's confirmed pairing and the Mac's keys for it, or undefined when not paired. */
async function paired(deps: PairingDeps) {
  const pairing = await deps.store.read();
  if (!pairing?.phoneKey) return undefined;
  return { pairing, keys: macKeys({ ...pairing, phoneKey: pairing.phoneKey }) };
}

/**
 * Pushes each new notice once when the profile is paired and `phone.push` allows it now: `always`,
 * or `away` while the Mac is idle or locked. A notice waits while the person is at the desk and
 * goes once they are away, if it is still unread; a push that fails is not tried again, and the
 * notice stays in the Inbox either way.
 */
export async function pushPending(deps: PushDeps): Promise<PushOutcome> {
  const { push: mode, awayAfter } = deps.settings;
  if (mode === 'never') return outcome('off');
  const window = awayAfter * 60_000 + PUSH_WINDOW_MS;
  const items = deps
    .pending(new Date(deps.clock().getTime() - window).toISOString())
    .filter((item) => item.kind !== 'finished' || deps.settings.finished);
  if (!items.length) return outcome('none');
  const found = await paired(deps);
  if (!found) return outcome('unpaired');
  const { pairing, keys } = found;
  const fresh = items.filter((item) => item.at >= (pairing.pairedAt ?? ''));
  if (!fresh.length) return outcome('none');
  if (mode === 'away' && !(await isAway(deps.run, awayAfter))) return outcome('at-desk');
  const claimed = new Set(deps.claim(fresh.map((item) => item.id)));
  const client = deps.client(pairing.broker);
  const pushed: string[] = [];
  const failed: PushOutcome['failed'] = [];
  // Oldest first, so the newest lands on top of the phone's list.
  for (const item of [...fresh].reverse().filter((each) => claimed.has(each.id))) {
    const kind: NoticeKind = item.kind === 'finished' ? 'finished' : 'input';
    // An approval names its run, which a tap opens; any other notice its session.
    const notice = sealNotice(
      keys,
      item.run
        ? { title: item.title, body: item.detail ?? '', run: item.run }
        : {
            title: item.sessionTitle ?? 'A session',
            body: `${projectLabel(deps.projectOf(item.session))}: ${item.title}`,
            session: item.session,
          },
    );
    await client.push(pairing.pairingId, pairing.macToken, kind, notice).then(
      () => pushed.push(item.id),
      (error) => failed.push({ id: item.id, error: failure(error) }),
    );
  }
  if (!pushed.length && !failed.length) return outcome('none');
  return outcome(failed.length ? 'failed' : 'pushed', { pushed, failed });
}

/** Pushes a sealed test notice now, whatever the idle time, and returns the broker's answer. */
export async function pushTest(deps: PairingDeps) {
  const found = await paired(deps);
  if (!found)
    throw new MesaError('usage', 'this profile is not paired with a phone; mesa phone pair first');
  const { pairing, keys } = found;
  const notice = sealNotice(keys, { title: 'Mesa', body: 'Pushes from this Mac reach your phone' });
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
