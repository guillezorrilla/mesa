import { type PhoneCall, type PhoneSaved, type PhoneToday, usd } from '@mesa/core/phone';

// How the phone says what the vault holds: a calendar leaf, Impact's counts, the week's cost, a receipt's kind, a
// saved decision's outcome, and when a decision can be saved.

/** Impact today as three numbers, the person's words for each; a guardrail stop counts as caught. */
export const impactStats = (impact: PhoneToday['impact']) => [
  { label: 'Kept', value: impact.kept },
  { label: 'Notes in', value: impact.notesIn },
  { label: 'Caught', value: impact.caught + impact.stopped },
];

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

/** The week's estimated cost as of the Mac's last usage sync (the phone never syncs), or unknown. */
export const costText = (cost: number | null) =>
  cost === null ? 'Cost unknown' : `${usd(cost, 2)} estimated at the last sync`;

const KINDS: Record<string, string> = {
  decision: 'Decision',
  'vault-change': 'Vault change',
  capture: 'Capture',
};

/** A receipt kind in words: "Vault change"; any other capitalised, "Phone". */
export const kindWord = (kind: string) =>
  KINDS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);

/** What saving a decision did: kept, or the same one already there, which adds nothing. */
export const savedText = (saved: PhoneSaved) =>
  saved.changed
    ? 'Kept in your vault, with its receipt.'
    : 'The same decision is already kept; nothing was added.';

/** What saving a decision sends: the `decide` call without its method. */
export type DecisionDraft = Omit<Extract<PhoneCall, { method: 'decide' }>, 'method'>;

/** A decision can be saved once it names its project, title, decision and rationale. */
export const draftReady = (draft: DecisionDraft) =>
  Object.values(draft).every((value) => value.trim().length > 0);
