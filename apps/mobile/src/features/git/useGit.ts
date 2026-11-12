import { startTransition, useActionState } from 'react';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useMacRead } from '../mac/useMacRead';
import { type GitAction, gitDone } from './gitDone';

/** A push, a pull or an agent writing a message can take a minute; the rest answer in seconds. */
export const SLOW_MS = 90_000;

/**
 * A session's checkout as source control: its status and branches as promises to `use()`, and
 * an action (stage, commit, push, pull, switch) that reads both again once it is done.
 */
export function useGit(id: string) {
  const link = useMac();
  const status = useMacRead({ method: 'status', id });
  const branches = useMacRead({ method: 'branches', id });
  const [said, act, pending] = useActionState(
    async (_last: string | undefined, action: GitAction) => {
      const slow = action.method === 'sync' ? SLOW_MS : undefined;
      const done = await tryCall(link, () => link.call(action, slow));
      status.again();
      branches.again();
      return done.error ?? gitDone(action, done.result);
    },
    undefined,
  );
  return {
    status: status.answer,
    branches: branches.answer,
    said,
    pending,
    run: (action: GitAction) => startTransition(() => act(action)),
    /** A commit message for what is staged, written by an agent on the Mac. */
    writeMessage: () => tryCall(link, () => link.call({ method: 'message', id }, SLOW_MS)),
  };
}
