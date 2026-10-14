import { daysBefore } from '../lib/time.js';
import type { DecisionLog } from './log.js';

// An advised note's outcome as it happens (CONTEXT.md, Impact): the agent read it through the
// Vault server. Only notes advice gave the reading session are logged; other reads stay unlogged.

/** How far back an opened note looks for the advice that named it. */
const ADVICE_DAYS = 30;

/**
 * Logs that the agent of `session` opened `note` (`read_note`), when advice in the last
 * ADVICE_DAYS named that note to this very session; once per advice, and nothing for any other read.
 */
export function noteOpened(
  log: DecisionLog,
  now: Date,
  session: { id: string; project: string },
  note: string,
): void {
  const lines = log.read({ since: daysBefore(now, ADVICE_DAYS), session: session.id });
  const mine = lines.filter((e) => e.site === 'relevance' && e.note === note);
  // Newest first: once per advice, so a note advised again can be opened again.
  const advised = mine.find((e) => e.changed);
  if (!advised || mine.some((e) => e.status === 'opened' && e.at >= advised.at)) return;
  log.append({
    site: 'relevance',
    session: session.id,
    project: session.project,
    question: 'Did the agent open the note it was given?',
    rules: null,
    answer: note,
    by: advised.by,
    status: 'opened',
    changed: false,
    note,
  });
}
