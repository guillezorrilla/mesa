import type { PhonePrDetail } from '@mesa/core/phone';
import { checkSummary } from './prText';

export type MergeHow = 'squash' | 'merge' | 'rebase';

/** Each method as GitHub's merge button names it, squash first: Mesa's default. */
export const MERGE_WORDS: Record<MergeHow, string> = {
  squash: 'Squash and merge',
  merge: 'Create a merge commit',
  rebase: 'Rebase and merge',
};

/**
 * The confirmation before a merge: the method and the checks' state, and when a check fails, a
 * destructive Merge anyway that carries the person's yes (`confirm`) to core.
 */
export function mergeAsk(
  pr: Pick<PhonePrDetail, 'number' | 'checks' | 'checkList'>,
  how: MergeHow,
) {
  const failing = pr.checks === 'failing';
  const failed = pr.checkList.filter((check) => check.state === 'failing').map((c) => c.name);
  const checks = failing
    ? `Failing: ${failed.join(', ') || 'a check'}. Merge anyway?`
    : pr.checks === 'pending'
      ? 'Checks are still running.'
      : `Checks: ${checkSummary(pr.checkList)}.`;
  return {
    title: `${MERGE_WORDS[how]} #${pr.number}?`,
    message: checks,
    action: failing ? 'Merge anyway' : 'Merge',
    confirm: failing,
  };
}
