// The Last 14 days chart's scale: a round top over the costliest day, its labels, each bar's
// height, and which day a finger is on.

/** A round top's leading digit, times a power of ten: the first that reaches the costliest day. */
const STEPS = [1, 2, 4, 6, 8, 10];

/** A scale value as the axis prints it: `$0`, `$0.02`, `$300`, `$1.2k`. */
export function axisMoney(value: number) {
  return value >= 1000
    ? `$${Number((value / 1000).toPrecision(2))}k`
    : `$${Number(value.toPrecision(2))}`;
}

/**
 * Linear like Apple Health's charts: a round top over the costliest day, with its gridlines top,
 * middle and zero labelled, so a $3 day beside a $522 one reads against `$600 / $300 / $0`.
 * `shares` is each cost as a share of the top, an unknown one 0; no cost at all has no top.
 */
export function chartScale(costs: readonly (number | null)[]) {
  const most = Math.max(0, ...costs.map((cost) => cost ?? 0));
  if (most === 0) return { top: 0, labels: [], shares: costs.map(() => 0) };
  const power = 10 ** Math.floor(Math.log10(most));
  const top = (STEPS.find((step) => step * power >= most) ?? 10) * power;
  return {
    top,
    labels: [top, top / 2, 0].map(axisMoney),
    shares: costs.map((cost) => (cost ?? 0) / top),
  };
}

/** The day under a finger `x` points across bars `width` wide, held to the first and last day. */
export function dayAt(x: number, width: number, count: number) {
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}
