import { FINAL_STATES, type SessionAction } from '@mesa/core/phone';

/**
 * The session menu's choices for a session in `state`: a live one stops, an ended one resumes; a
 * plain terminal has no conversation to resume, fork or hand off.
 */
export function menuActions(state: string, archived: boolean, terminal = false): SessionAction[] {
  if (archived) return ['unarchive'];
  const ended = (FINAL_STATES as ReadonlySet<string>).has(state);
  if (terminal) return ended ? ['rename', 'archive'] : ['stop', 'rename', 'archive'];
  return [ended ? 'resume' : 'stop', 'fork', 'handoff', 'rename', 'archive'];
}

export const ACTION_WORDS: Record<SessionAction, string> = {
  stop: 'Stop',
  resume: 'Resume',
  fork: 'Fork',
  handoff: 'Hand off',
  rename: 'Rename',
  archive: 'Archive',
  unarchive: 'Unarchive',
};

/** The actions that end or hide a session, which ask before they run. */
export const CONFIRMED: ReadonlySet<SessionAction> = new Set(['stop', 'archive']);

/** What a confirmation asks before `action` runs on the session titled `title`. */
export function confirmText(action: SessionAction, title: string, terminal = false) {
  if (action !== 'stop')
    return `Archive ${title}? A live session is stopped first; Unarchive brings it back.`;
  return terminal
    ? `Stop ${title}? Its shell and its window close.`
    : `Stop ${title}? Its agent is asked to quit, then its window closes.`;
}
