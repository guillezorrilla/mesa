import type { SessionAction } from '@mesa/core/phone';

/** The session menu's choices for a session in `state`: a live one stops, an ended one resumes. */
export function menuActions(state: string, archived: boolean): SessionAction[] {
  if (archived) return ['unarchive'];
  const ended = state === 'done' || state === 'failed' || state === 'stopped';
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
export function confirmText(action: SessionAction, title: string) {
  return action === 'stop'
    ? `Stop ${title}? Its agent is asked to quit, then its window closes.`
    : `Archive ${title}? A live session is stopped first; Unarchive brings it back.`;
}
