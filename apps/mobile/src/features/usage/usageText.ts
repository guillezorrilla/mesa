// How the phone says usage: estimated dollars, a day's initial, and a bar's height.

/** An estimated cost in dollars; unknown while a reading has no price. */
export function money(cost: number | null) {
  if (cost === null) return 'unknown';
  if (cost > 0 && cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}

/** A local day `YYYY-MM-DD` as its weekday's initial. */
export function dayInitial(day: string) {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return 'SMTWTFS'[new Date(year, month - 1, date).getDay()] ?? '';
}

/** Each cost as a share of the highest, 0 to 1; an unknown one as 0. */
export function barShares(costs: readonly (number | null)[]) {
  const top = Math.max(0, ...costs.map((cost) => cost ?? 0));
  return costs.map((cost) => (top > 0 ? (cost ?? 0) / top : 0));
}
