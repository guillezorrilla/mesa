/**
 * A thin pulsing bar while a slow read runs (a gcloud call takes seconds), named by `label`; the
 * last result stays shown under it.
 */
export function ReadingBar(props: { label?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={props.label ?? 'Reading'}
      className="h-0.5 animate-pulse rounded bg-state-working/70"
    />
  );
}
