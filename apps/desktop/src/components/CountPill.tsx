/** A small rounded count beside a label, in the attention tone Xirp uses for pending changes. */
export function CountPill(props: { count: number }) {
  return (
    <span className="rounded-full bg-state-waiting/20 px-1.5 text-xs text-state-waiting">
      {props.count}
    </span>
  );
}
