// How the phone says a day of usage: its initial under a bar, its date over the readout, and
// what VoiceOver reads for its bar.
import { excludedNote, money } from '@mesa/core/phone';

/** A day as the chart has it: its estimated cost and how many sessions that leaves out. */
type Day = { day: string; cost: number | null; excluded: number };

/** A local day `YYYY-MM-DD` as a Date at its local midnight. */
function localDate(day: string) {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** A local day `YYYY-MM-DD` as its weekday's initial. */
export function dayInitial(day: string) {
  return 'SMTWTFS'[localDate(day).getDay()] ?? '';
}

/** A local day as the readout heads it: `Wed, Nov 12`. */
export function dayDate(day: string, locale?: string) {
  return localDate(day).toLocaleDateString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** What VoiceOver reads for a day's bar: its whole date, its cost, and what the cost leaves out. */
export function dayBarLabel({ day, cost, excluded }: Day, locale?: string) {
  const date = localDate(day).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return [date, money(cost), excludedNote(excluded)].filter(Boolean).join(', ');
}
