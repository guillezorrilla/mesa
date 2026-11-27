import type { ActivityKind, SessionRow, SessionState } from '@mesa/core';
import { reportedState } from '@mesa/core/browser';
import type { Emote } from './sprites';

/**
 * What a session's character does: `type` and `read` at its screen, `sit` there still, `wave`
 * turned to the room, `turn` to the room without waving, or `stroll` around it.
 */
export type Pose = {
  state: SessionState;
  emote: Emote;
  does: 'type' | 'read' | 'sit' | 'wave' | 'turn' | 'stroll';
  /** The pose in words, for the nameplate and a screen reader. */
  says: string;
};

const WORK: Record<ActivityKind, [Emote, string, Pose['does']]> = {
  writing: ['pencil', 'writing', 'type'],
  reading: ['book', 'reading', 'read'],
  running: ['terminal', 'running a command', 'type'],
  searching: ['search', 'searching the web', 'type'],
  delegating: ['team', 'delegating', 'sit'],
  thinking: ['dots', 'thinking', 'sit'],
};

/**
 * The pose of `row`'s character, from the state its row shows (reportedState) and, while it
 * works, what its agent last did (its `activity`; thinking without one). An idle one strolls.
 */
export function officePose(row: SessionRow): Pose {
  const state = reportedState(row);
  const pose = (emote: Emote, says: string, does: Pose['does'] = 'turn'): Pose => ({
    state,
    emote,
    does,
    says,
  });
  switch (state) {
    case 'working': {
      const activity = row.managed ? row.activity : undefined;
      const [emote, verb, does] = WORK[activity?.kind ?? 'thinking'];
      return pose(emote, activity?.tool ? `${verb} (${activity.tool})` : verb, does);
    }
    case 'waiting-permission':
      return pose('alert', 'needs your permission', 'wave');
    case 'waiting-question':
      return pose(
        'question',
        row.managed && row.asking ? 'asking its parent' : 'has a question',
        'wave',
      );
    case 'idle':
      return row.managed && row.unread
        ? pose('check', 'finished its turn')
        : pose('sleep', 'idle', 'stroll');
    case 'done':
      return pose('check', 'done');
    case 'failed':
      return pose('cross', 'failed');
    case 'queued':
      return pose('hourglass', 'queued');
    case 'stopped':
      return pose('stop', 'stopped', 'sit');
  }
}
