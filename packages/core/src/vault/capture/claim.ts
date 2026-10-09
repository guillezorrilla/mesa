import type { MesaContext } from '../../context.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import { type CaptureInput, captureInput } from './input.js';

// A Vault capture's claim and mark on its session's record (CONTEXT.md, Vault capture): the claim
// is taken under the record's lock before its run starts, so one session has one capture run in
// flight at a time; the mark (`through`) is where the next capture starts reading.

// A claim is made before its run starts; a process that died in between left it with no run.
/** How old a claim with no run is before another capture may claim it again. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Whether `s` has a capture run in flight: a claim with a run, or one with none yet, younger than
 * STALE_CLAIM_MS.
 */
const captureInFlight = (s: SessionRecord, now: Date) =>
  s.capture?.state === 'running' &&
  (Boolean(s.capture.run) || now.getTime() - Date.parse(s.capture.at) <= STALE_CLAIM_MS);

/**
 * The mark `s`'s next capture reads past: its own last capture's, else that of the session it
 * resumed, whose conversation it goes on, and so on back; none when nothing was captured. A
 * capture that landed before marks were kept (#697: `done`, no `through`) covered everything up
 * to its `at`.
 */
export function captureMark(store: MesaContext['store'], s: SessionRecord) {
  const seen = new Set<string>();
  for (let r: SessionRecord | undefined = s; r && !seen.has(r.id); ) {
    const { capture } = r;
    if (capture?.through) return capture.through;
    if (capture?.state === 'done') return capture.at;
    seen.add(r.id);
    r = r.resumedFrom ? store.find(r.resumedFrom) : undefined;
  }
  return undefined;
}

/** A capture claimed for its run: the claimed record and the run's input, or why there is none. */
export type Claim = { about: SessionRecord; input: CaptureInput } | { refused: string };

/**
 * Claims `s`'s next capture: none while one is in flight; else its messages past its mark
 * (captureMark, captureInput), none when no message is newer; then, under the record's lock,
 * only when no capture is in flight and its capture has not changed since `s` was read. The
 * claim keeps the mark, and `upTo`, the mark its run leaves once it lands. The claimed record and
 * its run's input, or why it was refused.
 */
export function claimCapture(
  deps: Pick<MesaContext, 'store' | 'clock' | 'home' | 'env' | 'secrets'>,
  s: SessionRecord,
): Claim {
  const running = { refused: `session ${s.id}'s capture is running; wait for it to land` };
  if (captureInFlight(s, deps.clock())) return running;
  const through = captureMark(deps.store, s);
  const input = captureInput(deps, s, through);
  if (!input) {
    return {
      refused: through
        ? `session ${s.id} has no message newer than its last capture (${through})`
        : `session ${s.id} has no conversation to capture: its agent's transcript is not on this machine`,
    };
  }
  let claimed = false;
  const about = deps.store.update(s.id, (current) => {
    const now = deps.clock();
    if (captureInFlight(current, now) || current.capture?.at !== s.capture?.at) return {};
    claimed = true;
    return {
      capture: {
        at: now.toISOString(),
        state: 'running' as const,
        ...(through ? { through } : {}),
        ...(input.upTo ? { upTo: input.upTo } : {}),
      },
    };
  });
  return claimed ? { about, input } : running;
}
