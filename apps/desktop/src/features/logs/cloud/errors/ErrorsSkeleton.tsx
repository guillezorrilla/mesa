const ROWS = [0, 1, 2, 3, 4, 5, 6];

/** Placeholder rows shaped like the Errors list or its detail, while the first read runs. */
export function ErrorsSkeleton(props: { part: 'list' | 'detail' }) {
  if (props.part === 'list')
    return (
      <ul aria-label="Loading error groups" className="divide-y">
        {ROWS.map((i) => (
          <li
            key={i}
            className="grid h-[3.75rem] grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-3 px-4"
            style={{ opacity: 1 - i * 0.11 }}
          >
            <span className="grid gap-2">
              <span className="h-3 w-4/5 animate-pulse rounded bg-muted" />
              <span className="h-2.5 w-2/5 animate-pulse rounded bg-muted/70" />
            </span>
            <span className="h-6 animate-pulse rounded bg-muted/70" />
          </li>
        ))}
      </ul>
    );
  return (
    <div role="status" aria-label="Loading the error" className="grid gap-6 p-6">
      <span className="h-4 w-3/5 animate-pulse rounded bg-muted" />
      <span className="h-3 w-2/5 animate-pulse rounded bg-muted/70" />
      <span className="h-14 animate-pulse rounded bg-muted/60" />
      <span className="h-24 animate-pulse rounded bg-muted/50" />
      <span className="h-16 animate-pulse rounded bg-muted/40" />
    </div>
  );
}
