import { openedAfter } from '../impact/report.js';
import { daysBefore } from '../lib/time.js';
import { type DecisionLine, type DecisionLog, isDecision } from './log.js';

// An advised note's outcome as it happens (CONTEXT.md, Impact): the agent read it through the
// Vault server. Only notes advice gave the reading session are logged; other reads stay unlogged.

/** How far back an opened note looks for the advice that named it. */
const ADVICE_DAYS = 30;

/**
 * Logs that the agent of `session` opened `note` (`read_note`), when advice in the last
 * ADVICE_DAYS named that note to this very session; once per advice, so a note advised again can
 * be opened again, and nothing for any other read.
 */
export function noteOpened(
  log: DecisionLog,
  now: Date,
  session: { id: string; project: string },
  note: string,
): void {
  const lines = log.read({ since: daysBefore(now, ADVICE_DAYS), session: session.id });
  // Newest first: the latest advice that named this note.
  const advised = lines.find(
    (e) => isDecision(e) && e.site === 'relevance' && e.changed && e.note === note,
  ) as DecisionLine | undefined;
  if (!advised || lines.some((e) => e.status === 'opened' && openedAfter(advised, e))) return;
  log.append({ session: session.id, project: session.project, status: 'opened', note });
}
