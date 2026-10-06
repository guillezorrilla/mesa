// How Mesa shows a number to a person, the same in the CLI and in the app. Pure, so the app
// bundles it (`@mesa/core/browser`).

/** A number of things as it reads: `1 conversation`, `2 conversations`. */
export const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** Seconds as `42s`, `5m03s`, or `2h07m`. */
export function duration(seconds: number): string {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const two = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h${two(m)}m`;
  return m ? `${m}m${two(s)}s` : `${s}s`;
}

/**
 * Dollars as `$0.0123` to `places` decimals: 4 where the CLI shows a run's cost, 2 (cents) in the
 * app and in alerts. With no `places`, every digit the number has, as a usage row prints it.
 */
export const usd = (value: number, places?: number) =>
  `$${places === undefined ? value : value.toFixed(places)}`;

/** What a run or a decision cost at list price, as ` (list price $0.0123)`; nothing when free. */
export const listPrice = (costUsd: number | undefined) =>
  costUsd === undefined ? '' : ` (list price ${usd(costUsd, 4)})`;

/** A Faro probability, confidence or score to two places: `0.80`. */
export const odds = (value: number) => value.toFixed(2);

/** A share of 1 as a whole percent: a state's confidence, `95%`. */
export const percent = (share: number) => `${Math.round(share * 100)}%`;
