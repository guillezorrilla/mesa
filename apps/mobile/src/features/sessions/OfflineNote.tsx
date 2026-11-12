import { ErrorNote } from '@/components/ErrorNote';
import { offlineText } from './offlineText';

/** Said above the last rows when the Mac did not answer: asleep or offline, and when last heard. */
export function OfflineNote({ heardAt, now }: { heardAt: number | undefined; now: number }) {
  return <ErrorNote text={offlineText(heardAt, now)} />;
}
