import type { MacPath } from './direct.js';
import { directPath } from './direct-path.js';
import type { PhoneMessage } from './envelope.js';
import { type ConnectSocket, type MailboxEnd, mailbox } from './mailbox.js';
import { MacCallError, macCalls } from './requests.js';
import type { CallResult, PhoneCall } from './rpc.js';

/**
 * The phone's line to one Mac (ADR-0027): the Pairing's mailbox, its calls, and the path the boxes
 * take (directPath, #1129). The app's macLink and the tests run the same one. `message` hears
 * every message from the Mac, responses included, after their calls settled.
 */
export function phoneLine(
  deps: {
    connect: ConnectSocket;
    now: () => Date;
    wait: (ms: number) => Promise<void>;
    newId: () => string;
  },
  end: MailboxEnd,
  on: {
    message?: (message: PhoneMessage) => void;
    path?: (path: MacPath) => void;
    /** The broker's socket closed without this side asking. */
    closed?: () => void;
    taken?: (seq: number) => void;
  },
) {
  const box = mailbox(deps, end, {
    message: (message) => {
      paths.heard(message);
      calls.settle(message);
      on.message?.(message);
    },
    lost: (id) => calls.lost(id),
    direct: (url) => paths.moved(url),
    ...(on.closed ? { closed: on.closed } : {}),
    ...(on.taken ? { taken: on.taken } : {}),
  });
  const calls = macCalls({
    send: (message) => box.send(message),
    newId: deps.newId,
    wait: deps.wait,
  });
  const paths = directPath({ wait: deps.wait, now: () => deps.now().getTime() }, box, {
    path: (path) => on.path?.(path),
  });
  let open = false;
  return {
    /** Asks the Mac; a call the direct path leaves unanswered drops that path for the relay. */
    call: <M extends PhoneCall['method']>(
      call: Extract<PhoneCall, { method: M }>,
      timeoutMs?: number,
    ): Promise<CallResult<M>> =>
      calls.call(call, timeoutMs).catch((error) => {
        if (error instanceof MacCallError && error.reason === 'timeout') paths.suspect();
        throw error;
      }),
    /** Opens the broker's socket (again after a drop), and the direct path once the Mac says where. */
    connect() {
      box.connect();
      if (open) return;
      open = true;
      paths.start();
    },
    /** Lets both paths go. */
    close() {
      open = false;
      paths.stop();
      box.close();
    },
    /** The path the boxes take now. */
    path: () => paths.path(),
  };
}

export type PhoneLine = ReturnType<typeof phoneLine>;
