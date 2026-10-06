import { LoaderCircle } from 'lucide-react';

/** One placeholder per session starting in `project`, shown until it opens. */
export function StartingSessions(props: { project: string; starting?: readonly string[] }) {
  return (props.starting ?? [])
    .filter((name) => name === props.project)
    .map((_, i) => (
      <div
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, one per start
        key={i}
        role="status"
        data-testid="starting-session"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground"
      >
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Starting session
      </div>
    ));
}
