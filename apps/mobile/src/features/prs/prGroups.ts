import { BUCKET_LABELS, type PhonePr } from '@mesa/core/phone';

export type PrSection = { title: string; data: PhonePr[] };

/** The queue in Mesa's buckets, most urgent first (BUCKET_LABELS); a bucket this app does not know comes last. */
export function groupPrs(prs: readonly PhonePr[]): PrSection[] {
  const known = Object.entries(BUCKET_LABELS).map(([bucket, title]) => ({
    title,
    data: prs.filter((pr) => pr.bucket === bucket),
  }));
  const other = prs.filter((pr) => !(pr.bucket in BUCKET_LABELS));
  return [...known, { title: 'Other', data: other }].filter((section) => section.data.length);
}
