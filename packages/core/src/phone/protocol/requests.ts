import type { PhoneMessage } from './envelope.js';
import { type CallResult, callResults, type PhoneCall } from './rpc.js';

/** Why a call to the Mac has no result: no answer in time, a part lost, or the Mac's own error. */
export class MacCallError extends Error {
  constructor(
    readonly reason: 'timeout' | 'lost' | 'failed',
    message: string,
  ) {
    super(message);
  }
}

type Waiting = { settle: (result: unknown, error?: Error) => void };

/**
 * The phone's calls to the Mac: `call` sends a request through `send` and waits for the response
 * with its id, checking the result against the call's schema; it fails after `timeoutMs`, when a
 * Mac asleep or offline answers nothing. Feed it every message (`settle`) and every lost payload.
 */
export function macCalls(deps: {
  send: (message: PhoneMessage) => void;
  newId: () => string;
  wait: (ms: number) => Promise<void>;
  timeoutMs?: number;
}) {
  const waiting = new Map<string, Waiting>();
  const finish = (id: string, result: unknown, error?: Error) => {
    const entry = waiting.get(id);
    waiting.delete(id);
    entry?.settle(result, error);
  };
  return {
    /** Asks the Mac; `timeoutMs` for a call that runs longer than most (an agent, a push). */
    call<M extends PhoneCall['method']>(
      call: Extract<PhoneCall, { method: M }>,
      timeoutMs = deps.timeoutMs ?? 10_000,
    ): Promise<CallResult<M>> {
      const id = deps.newId();
      const answer = new Promise<CallResult<M>>((resolve, reject) => {
        waiting.set(id, {
          settle: (result, error) => {
            if (error) return reject(error);
            const parsed = callResults[call.method].safeParse(result);
            if (parsed.success) resolve(parsed.data as CallResult<M>);
            else
              reject(new MacCallError('failed', 'the Mac answered something this app cannot read'));
          },
        });
      });
      deps.send({ kind: 'request', id, call });
      void deps
        .wait(timeoutMs)
        .then(() =>
          finish(id, undefined, new MacCallError('timeout', 'the Mac did not answer in time')),
        );
      return answer;
    },
    /** Settles the call a response answers; false for any other message. */
    settle(message: PhoneMessage): boolean {
      if (message.kind !== 'response') return false;
      finish(
        message.id,
        message.result,
        message.error === undefined ? undefined : new MacCallError('failed', message.error),
      );
      return true;
    },
    /** Fails the call whose answer lost a part. */
    lost(id: string) {
      finish(id, undefined, new MacCallError('lost', "part of the Mac's answer was lost"));
    },
  };
}
