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

/**
 * The sessions whose usage was not read, counted per reason rather than listed by id (a month can
 * leave out hundreds): `Not read: 160 sessions (claude usage is unavailable).`; nothing when none.
 */
export function unreadNote(unread: readonly { reason: string }[]): string {
  const reasons = new Map<string, number>();
  for (const { reason } of unread) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  const parts = [...reasons].map(([reason, n]) => `${counted(n, 'session')} (${reason})`);
  return parts.length > 0 ? `Not read: ${parts.join(', ')}.` : '';
}

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

/** The most of a reply's first line a preview reads: a card shows one truncated line anyway. */
const PREVIEW_CHARS = 500;

/**
 * A Markdown text's first line as plain text, for a one-line preview: no heading, list or quote
 * marker, no bold, italic or code marks, and a link as its words. Snake_case and lone asterisks
 * stay. Each pattern matches without backtracking (negated classes), over at most PREVIEW_CHARS.
 */
export const plainLine = (text: string) =>
  firstLine(text)
    .slice(0, PREVIEW_CHARS)
    .replace(/^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/\[([^[\]]+)\]\([^()]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
