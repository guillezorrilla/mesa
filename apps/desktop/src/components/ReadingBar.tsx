/**
 * A thin pulsing bar while a Cloud Logs read runs (each gcloud call takes seconds); the last result
 * for the same filters stays shown under it, from the app's cache of replies.
 */
export function ReadingBar() {
  return (
    <div
      role="progressbar"
      aria-label="Reading"
      className="h-0.5 animate-pulse rounded bg-state-working/70"
    />
  );
}
