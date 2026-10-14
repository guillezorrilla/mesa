import type { Bucket } from '@mesa/core';

/** How a PR's state is coloured, one place for the row's tag and the detail's callout. */
export type PrTone = { box: string; text: string };

const QUIET: PrTone = { box: 'bg-muted', text: 'text-muted-foreground' };

/** The tone of each state: drafts waiting on me, a review owed, news since mine, or nothing to do. */
export const PR_TONE: Record<'drafts' | Bucket, PrTone> = {
  drafts: { box: 'bg-state-idle/10', text: 'text-state-idle' },
  need: { box: 'bg-state-working/10', text: 'text-state-working' },
  updated: { box: 'bg-state-waiting/15', text: 'text-state-waiting' },
  waiting: QUIET,
  done: QUIET,
  other: QUIET,
};
