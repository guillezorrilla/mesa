import { openedAfter } from '../impact/report.js';
import { recentLines, sentAdvice } from './delivery.js';
import type { DecisionLog } from './log.js';

// An advised note's outcome as it happens (CONTEXT.md, Impact): the agent read it through the
// Vault server. Only notes advice gave the reading session are logged; other reads stay unlogged.

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
  const lines = recentLines(log, now, session.id);
  const advised = sentAdvice(lines, note);
  if (!advised || lines.some((e) => e.status === 'opened' && openedAfter(advised, e))) return;
  log.append({ session: session.id, project: session.project, status: 'opened', note });
}
