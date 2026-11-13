// How the phone says a day of usage: its initial under a bar, its date over the readout, and
// what VoiceOver reads for its bar.
import { excludedNote, money, type PhoneDay } from '@mesa/core/phone';

/** A local day `YYYY-MM-DD` as a Date at its local midnight. */
function localDate(day: string) {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** A local day `YYYY-MM-DD` as its weekday's initial. */
export function dayInitial(day: string) {
  return 'SMTWTFS'[localDate(day).getDay()] ?? '';
}

/** A local day's date, its names `short` (`Wed, Nov 12`) or `long` (`Wednesday, November 12`). */
function dateText(day: string, names: 'short' | 'long', locale?: string) {
  return localDate(day).toLocaleDateString(locale, {
    weekday: names,
    month: names,
    day: 'numeric',
  });
}

/** A local day as the readout heads it: `Wed, Nov 12`. */
export function dayDate(day: string, locale?: string) {
  return dateText(day, 'short', locale);
}

/** What VoiceOver reads for a day's bar: its whole date, its cost, and what the cost leaves out. */
export function dayBarLabel(
  { day, cost, excluded }: Pick<PhoneDay, 'day' | 'cost' | 'excluded'>,
  locale?: string,
) {
  return [dateText(day, 'long', locale), money(cost), excludedNote(excluded)]
    .filter(Boolean)
    .join(', ');
}
