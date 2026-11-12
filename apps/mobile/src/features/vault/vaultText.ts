import type { PhoneSaved, PhoneToday } from '@mesa/core/phone';

// How the phone says what the vault holds: a day and its calendar leaf, Impact's counts, the week's cost, a receipt's kind, a
// saved decision's outcome, and when a decision can be saved.

/** Impact today as three numbers, the person's words for each; a guardrail stop counts as caught. */
export const impactStats = (impact: PhoneToday['impact']) => [
  { label: 'Kept', value: impact.kept },
  { label: 'Notes in', value: impact.notesIn },
  { label: 'Caught', value: impact.caught + impact.stopped },
];

/** An ISO time's local day, `YYYY-MM-DD`, as the vault names its days. */
export function dayOf(iso: string) {
  const at = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ');
const WEEKDAYS = 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday'.split(' ');

/** A day as a calendar leaf shows it: its month short, its day of the month, its weekday. */
export const calendarLeaf = (at: Date) => ({
  month: MONTHS[at.getMonth()] ?? '',
  day: String(at.getDate()),
  weekday: WEEKDAYS[at.getDay()] ?? '',
});

/** How many items a search found, and how many of them came back. */
export const foundText = (total: number, shown: number) =>
  total === 0
    ? 'Nothing in the vault has every word.'
    : total > shown
      ? `The first ${shown} of ${total}`
      : `${total} found`;

/** The week's estimated cost, or that some of it is unknown, never a guess. */
export const costText = (usd: number | null) =>
  usd === null ? 'Cost unknown' : `$${usd.toFixed(2)} estimated`;

const KINDS: Record<string, string> = {
  decision: 'Decision',
  'vault-change': 'Vault change',
  capture: 'Capture',
};

/** A receipt kind in words: "Vault change"; any other as it is. */
export const kindWord = (kind: string) => KINDS[kind] ?? kind;

/** What saving a decision did: kept, or the same one already there, which adds nothing. */
export const savedText = (saved: PhoneSaved) =>
  saved.changed
    ? 'Kept in your vault, with its receipt.'
    : 'The same decision is already kept; nothing was added.';

export type DecisionDraft = { project: string; title: string; decision: string; rationale: string };

/** A decision can be saved once it names its project, title, decision and rationale. */
export const draftReady = (draft: DecisionDraft) =>
  Object.values(draft).every((value) => value.trim().length > 0);
