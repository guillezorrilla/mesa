import type { PrRef } from '@/lib/client/prs';

/** One PR's key across the Reviews screens: `project#number`. */
export const prKey = (pr: PrRef) => `${pr.project}#${pr.number}`;
