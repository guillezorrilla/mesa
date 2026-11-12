import type { PhoneCall } from '@mesa/core/phone';

/** A source control action the Git screen runs. */
export type GitAction = Extract<PhoneCall, { method: 'stage' | 'commit' | 'sync' | 'switch' }>;

/** What a source control action did, in words. */
export function gitDone(action: GitAction, result: unknown) {
  switch (action.method) {
    case 'stage':
      return `${action.staged ? 'Staged' : 'Unstaged'} ${action.path}.`;
    case 'commit':
      return `Committed ${String((result as { oid: string }).oid).slice(0, 7)}.`;
    case 'sync': {
      const { remote, upstream } = result as { remote: string; upstream: string };
      return action.action === 'push'
        ? `Pushed to ${remote}/${upstream}.`
        : `Pulled from ${remote}/${upstream}.`;
    }
    case 'switch':
      return `Switched to ${action.name}.`;
  }
}
