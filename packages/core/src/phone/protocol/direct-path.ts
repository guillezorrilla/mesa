import { directUrls, type MacPath, pathOfUrl } from './direct.js';
import type { PhoneMessage } from './envelope.js';
import type { Mailbox } from './mailbox.js';

/**
 * How long the phone's sends wait for a direct dial before they go by the relay: orca's head start
 * (DIRECT_DIAL_GRACE_MS, 2.5 s), cut to the second #1129 asks for.
 */
export const HEAD_START_MS = 1000;
/**
 * How long the phone stays on the relay after the direct path failed or dropped before it dials
 * again: orca's FAILURE_COOLDOWN_MS and MINIMUM_DWELL_MS, so a flaky Wi-Fi cannot flap the path.
 */
export const RETRY_MS = 60_000;

/**
 * The phone's choice of path to one Mac (#1129, after orca's MobileEndpointSupervisor): it asks the
 * Mac where its own socket is, over the relay, and dials it; sends go direct once it answers, by
 * the relay when it does not within HEAD_START_MS or drops, and direct again after RETRY_MS (a
 * dial that holds no send, as orca's return probe). Feed
 * it every message from the Mac (`heard`) and every move of the mailbox's direct path (`moved`).
 */
export function directPath(
  deps: { wait: (ms: number) => Promise<void>; now: () => number },
  box: Pick<Mailbox, 'dial' | 'undial' | 'send'>,
  on: { path: (path: MacPath) => void },
) {
  let urls: string[] = [];
  let path: MacPath = 'relay';
  let running = false;
  let dialing = false;
  let dials = 0;
  // Sends wait for the first dial after the line opens (the head start), not for a retry.
  let fresh = false;
  let coolUntil = 0;
  // Bumped on stop, so a wait from an earlier run does nothing.
  let run = 0;
  const later = (ms: number, then: () => void) => {
    const mine = run;
    void deps.wait(ms).then(() => mine === run && running && then());
  };
  const go = (next: MacPath) => {
    if (next === path) return;
    path = next;
    on.path(path);
  };
  const ask = () => box.send({ kind: 'direct' });
  const cool = () => {
    coolUntil = deps.now() + RETRY_MS;
    later(RETRY_MS, ask);
  };
  const dial = () => {
    if (!running || dialing || path !== 'relay' || !urls.length || deps.now() < coolUntil) return;
    dialing = true;
    const mine = ++dials;
    box.dial(urls, fresh);
    fresh = false;
    later(HEAD_START_MS, () => {
      if (!dialing || mine !== dials) return;
      dialing = false;
      box.undial();
      cool();
    });
  };
  return {
    path: () => path,
    /** The line opened: dial the addresses known, and ask for fresh ones. */
    start() {
      running = true;
      fresh = true;
      dial();
      ask();
    },
    /** The line closed: no dial, no wait from this run. */
    stop() {
      running = false;
      dialing = false;
      run += 1;
      box.undial();
      go('relay');
    },
    heard(message: PhoneMessage) {
      if (message.kind !== 'direct') return;
      urls = directUrls(message);
      dial();
    },
    /** The mailbox's direct path opened at `url`, or closed: back to the relay for RETRY_MS. */
    moved(url: string | undefined) {
      dialing = false;
      if (url) return go(pathOfUrl(url));
      if (!running || path === 'relay') return;
      go('relay');
      // Asking now also tells the Mac the phone is on the relay, so it answers there.
      ask();
      cool();
    },
    /** A call on the direct path got no answer: the path may be dead without a close. */
    suspect() {
      if (path !== 'relay') box.undial();
    },
  };
}
