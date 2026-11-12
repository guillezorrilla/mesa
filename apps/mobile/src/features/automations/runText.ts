// How the phone says an automation run's outcome: its words and its state colour token.

const WORDS: Record<string, string> = {
  pending: 'Waiting for you',
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** A run's status as a person reads it; an unknown one (a newer Mac's) as it is. */
export const runWords = (status: string) => WORDS[status] ?? status;

/** A run's colour, Mesa's state tokens: waiting, working, done, failed, or muted. */
export function runColor(status: string) {
  if (status === 'pending') return 'bg-state-waiting';
  if (status === 'queued' || status === 'running') return 'bg-state-working';
  if (status === 'done') return 'bg-state-done';
  if (status === 'failed') return 'bg-state-failed';
  return 'bg-muted-foreground';
}
