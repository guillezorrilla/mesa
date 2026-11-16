import { prepareCommand } from '../../decisions/delivery.js';
import type { SessionRecord } from '../record/record.js';
import type { LaunchDeps } from './launch.js';

// The command line a session's window opens with: its agent's command, behind the background ask
// for its goal while the profile has a Decision model.

/**
 * The background ask for a session's goal while its agent starts (decisions/delivery.ts): for an
 * interactive session with a goal while the profile has a Decision model; none otherwise.
 */
export const goalPreparing = (
  deps: Pick<LaunchDeps, 'profile' | 'self'>,
  kind: SessionRecord['kind'],
  goal?: string,
) =>
  deps.profile.config.decisions.model !== 'none' && goal && kind === 'interactive'
    ? prepareCommand(deps.self)
    : '';

/**
 * The command tmux receives, including Claude's color and process-identity setup, after
 * `preparing` (goalPreparing). Behind `preparing` the line is a list, which sh no longer replaces
 * with its last command, so an agent that does not exec itself is exec'd: it stays the pane's own
 * process, which `send` and the Board read.
 */
export function sessionWindowCommand(
  agent: SessionRecord['agent'],
  kind: SessionRecord['kind'],
  command: string,
  preparing = '',
) {
  if (agent === 'claude' && kind === 'interactive')
    return `${preparing}unset NO_COLOR; exec ${command.replace(/^exec /, '')}`;
  return preparing && !/(^|; )exec /.test(command)
    ? `${preparing}exec ${command}`
    : `${preparing}${command}`;
}
