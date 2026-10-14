// How long ago something happened, as a person reads it. Pure, so the app bundles it
// (`@mesa/core/browser`).

const minutesSince = (at: string, now: number) => Math.floor((now - Date.parse(at)) / 60_000);

/** "just now", "5m ago", "3h ago" within a day; a local date after that. */
export function timeAgo(at: string, now: number) {
  const minutes = minutesSince(at, now);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(at).toLocaleDateString();
}

/** Always relative, for a sentence: "just now", "5m ago", "3h ago", "2d ago", "3w ago", "4mo ago", "2y ago". */
export function relativeAgo(at: string, now: number) {
  const days = Math.floor(minutesSince(at, now) / (24 * 60));
  if (days < 1) return timeAgo(at, now);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** The compact form for dense lists: "now", "5m", "3h", "4d" within a month; a short date after. */
export function shortAgo(at: string, now: number) {
  const minutes = minutesSince(at, now);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 30 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
