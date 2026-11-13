import { ErrorNote } from '@/components/ErrorNote';
import { offlineText } from './offlineText';

/** Said above the last rows when a Mac did not answer: asleep or offline, and when last heard. */
export function OfflineNote({
  heardAt,
  now,
  name,
}: {
  heardAt: number | undefined;
  now: number;
  /** The Mac's name, among several. */
  name?: string;
}) {
  return <ErrorNote text={offlineText(heardAt, now, name)} />;
}
