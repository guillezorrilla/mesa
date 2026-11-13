/** A count as a tab's badge: none at zero, capped at 99+. */
export const badgeText = (count: number) =>
  count <= 0 ? undefined : count > 99 ? '99+' : String(count);
