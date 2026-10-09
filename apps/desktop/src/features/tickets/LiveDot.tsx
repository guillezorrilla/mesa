/** A green dot and "Live": a session is working from this ticket. */
export function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-state-done">
      <span className="size-1.5 rounded-full bg-state-done ring-2 ring-state-done/20" />
      Live
    </span>
  );
}
