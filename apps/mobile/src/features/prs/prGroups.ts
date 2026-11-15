import { BUCKET_LABELS, type PhonePr } from '@mesa/core/phone';
import { ALL } from '../../lib/keptChoice';

export type PrSection = { key: string; title: string; short: string; data: PhonePr[] };

/** A bucket's name on its chip, where its heading does not fit. */
const SHORT: Record<keyof typeof BUCKET_LABELS, string> = {
  need: 'To review',
  updated: 'Updated',
  waiting: 'Waiting',
  other: 'Not for you',
};

/** The queue in Mesa's buckets, most urgent first (BUCKET_LABELS); a bucket this app does not know comes last. */
export function groupPrs(prs: readonly PhonePr[]): PrSection[] {
  const known = Object.entries(BUCKET_LABELS).map(([key, title]) => ({
    key,
    title,
    short: SHORT[key as keyof typeof BUCKET_LABELS],
    data: prs.filter((pr) => pr.bucket === key),
  }));
  const other = prs.filter((pr) => !(pr.bucket in BUCKET_LABELS));
  return [...known, { key: 'unknown', title: 'Other', short: 'Other', data: other }].filter(
    (section) => section.data.length,
  );
}

/**
 * The bucket chips over the queue: All, then each bucket listed with how many PRs it holds; none
 * while a single bucket is listed.
 */
export function bucketChoices(sections: readonly PrSection[]) {
  if (sections.length < 2) return [];
  return [
    {
      value: ALL,
      label: 'All',
      count: sections.reduce((n, section) => n + section.data.length, 0),
    },
    ...sections.map((s) => ({ value: s.key, label: s.short, count: s.data.length })),
  ];
}
