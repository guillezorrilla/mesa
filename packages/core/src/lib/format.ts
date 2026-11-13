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

/** An estimated cost to the cent; a cost too small for a cent still reads as spent. */
export const money = (value: number | null) =>
  value === null ? 'Unknown' : value > 0 && value < 0.005 ? '<$0.01' : usd(value, 2);

/** What a partial usage total leaves out (UsageTotals' `excluded`); nothing when it is whole. */
export const excludedNote = (sessions: number) =>
  sessions > 0 ? `excludes ${counted(sessions, 'session')}` : '';

/** What a run or a decision cost at list price, as ` (list price $0.0123)`; nothing when free. */
export const listPrice = (costUsd: number | undefined) =>
  costUsd === undefined ? '' : ` (list price ${usd(costUsd, 4)})`;

/** A Faro probability, confidence or score to two places: `0.80`. */
export const odds = (value: number) => value.toFixed(2);

/** A share of 1 as a whole percent: a state's confidence, `95%`. */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Bytes as they read on disk, in powers of 1,000 as Finder counts: `512 B`, `5.2 MB`, `12.3 GB`. */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  // 999.95 KB would print as 1000.0 KB: it reads as the next unit.
  while (value >= 999.95 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return unit ? `${value.toFixed(1)} ${units[unit]}` : `${value} B`;
}

/** A text's first line, without its leading blank lines and spaces: a title or a one-line summary. */
export const firstLine = (text: string) => text.trim().split(/\r?\n/, 1)[0] ?? '';
