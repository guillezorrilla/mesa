import { CHECK_STATES, type PhoneCheck, type PhonePr } from '@mesa/core/phone';

/** Where a PR is and whose: "tide-pool #7 · lee-park". */
export const prMeta = (pr: Pick<PhonePr, 'project' | 'number' | 'author'>) =>
  `${pr.project} #${pr.number} · ${pr.author}`;

/** A bucket's dot colour: the ones asking something of me loud, the rest quiet. */
export const bucketColor = (bucket: string) =>
  bucket === 'need'
    ? 'bg-state-waiting'
    : bucket === 'updated'
      ? 'bg-state-working'
      : 'bg-muted-foreground';

const CHECK_COLOR: Record<PhoneCheck['state'], string> = {
  failing: 'bg-state-failed',
  pending: 'bg-state-waiting',
  passing: 'bg-state-done',
  skipped: 'bg-muted-foreground',
};

/** A check state's colour class, for a dot or an edge (`bg-` swapped by the caller). */
export const checkColor = (state: PhoneCheck['state'] | null) =>
  state ? CHECK_COLOR[state] : 'bg-muted-foreground';

/** The checks counted by state, failing first: "1 failing · 2 passing", or "No checks". */
export function checkSummary(checks: readonly PhoneCheck[]) {
  const counts = CHECK_STATES.flatMap((state) => {
    const n = checks.filter((check) => check.state === state).length;
    return n ? [`${n} ${state === 'pending' ? 'running' : state}`] : [];
  });
  return counts.length ? counts.join(' · ') : 'No checks';
}

const VERDICTS: Record<string, string> = {
  addressed: 'Addressed',
  partly: 'Partly addressed',
  not: 'Not addressed',
};

/** A thread's state as its badge says it: a re-review's verdict wins over resolved. */
export const threadState = (thread: { resolved: boolean; verdict?: string }) =>
  (thread.verdict && VERDICTS[thread.verdict]) ?? (thread.resolved ? 'Resolved' : 'Open');
