import { MERGE_LABELS, type MergeMethod, type PhonePrDetail } from '@mesa/core/phone';
import { checkSummary } from './prText';

/**
 * The confirmation before a merge: the method and the checks' state, and when a check fails, a
 * destructive Merge anyway that carries the person's yes (`confirm`) to core.
 */
export function mergeAsk(
  pr: Pick<PhonePrDetail, 'number' | 'checks' | 'checkList'>,
  how: MergeMethod,
) {
  const failing = pr.checks === 'failing';
  const failed = pr.checkList.filter((check) => check.state === 'failing').map((c) => c.name);
  const checks = failing
    ? `Failing: ${failed.join(', ') || 'a check'}. Merge anyway?`
    : pr.checks === 'pending'
      ? 'Checks are still running.'
      : `Checks: ${checkSummary(pr.checkList)}.`;
  return {
    title: `${MERGE_LABELS[how]} #${pr.number}?`,
    message: checks,
    action: failing ? 'Merge anyway' : 'Merge',
    confirm: failing,
  };
}

/** What to ask when the Mac refused a merge until confirmed, as core refuses it. */
export const refusedAsk = (refused: 'conflicting' | 'checks-failing') =>
  refused === 'conflicting'
    ? 'It conflicts with its base, so GitHub may refuse it too. Merge anyway?'
    : 'A check failed since this screen read the PR. Merge anyway?';
