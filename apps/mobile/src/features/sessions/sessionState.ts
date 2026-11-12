// How the phone reads a session state (CONTEXT.md, Session state): its group on the Agents tab,
// its words, and its colour token.

export type Group = 'needs-you' | 'working' | 'done';

/** Needs you: waiting on a permission or a question. Working: at work or queued. Done: the rest. */
export function groupOf(state: string): Group {
  if (state === 'waiting-permission' || state === 'waiting-question') return 'needs-you';
  if (state === 'working' || state === 'queued') return 'working';
  return 'done';
}

export const GROUP_TITLES: Record<Group, string> = {
  'needs-you': 'Needs you',
  working: 'Working',
  done: 'Done',
};

const WORDS: Record<string, string> = {
  working: 'Working',
  'waiting-permission': 'Asking permission',
  'waiting-question': 'Asking a question',
  idle: 'Idle',
  done: 'Done',
  failed: 'Failed',
  queued: 'Queued',
  stopped: 'Stopped',
};

/** A state as a person reads it; an unknown one (a newer Mac's) as it is. */
export const stateWords = (state: string) => WORDS[state] ?? state;

/** The state's colour, Mesa's state tokens as on the desktop; an unread finished one is green. */
export function stateColor(state: string, unread = false) {
  const group = groupOf(state);
  if (group === 'needs-you') return 'bg-state-waiting';
  if (group === 'working') return 'bg-state-working';
  if (unread) return 'bg-state-unread';
  if (state === 'failed') return 'bg-state-failed';
  return state === 'idle' ? 'bg-state-idle' : 'bg-state-done';
}
