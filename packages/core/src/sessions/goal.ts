import { MesaError } from '../lib/result.js';
import { readTextFile } from '../lib/text-file.js';
import type { SessionStore } from './store.js';

// A session's goal, its first prompt (CONTEXT.md, Goal): read, checked, and kept on the record.

// ponytail: one tmux command holds about 16 KiB (measured: 15000 bytes went through, 17000 was
// "command too long"), so Mesa caps the agent's command below that, leaving room for the cwd and
// the variables. Past that, type the goal in with send-keys after the start.
const MAX_COMMAND_BYTES = 12_000;

/**
 * The goal from `--goal` or `--goal-file` (an absolute path), checked so claude takes it whole as
 * its first prompt. Undefined without either.
 */
export function readGoal(input: { goal?: string; goalFile?: string }): string | undefined {
  if (input.goal !== undefined && input.goalFile !== undefined) {
    throw new MesaError('usage', 'pass --goal or --goal-file, not both');
  }
  const goal =
    input.goalFile === undefined ? input.goal : readTextFile(input.goalFile, 'goal file');
  if (goal === undefined) return undefined;
  if (!goal.trim()) throw new MesaError('usage', 'the goal is empty');
  if (goal.startsWith('-')) {
    throw new MesaError('usage', 'a goal cannot start with -: claude would read it as a flag');
  }
  // A process argument cannot hold one.
  if (goal.includes('\0')) throw new MesaError('usage', 'the goal holds a NUL byte');
  return goal;
}

/** Refuses an agent command too long for one tmux command; the goal is what makes it long. */
export function requireCommandFits(command: string): void {
  const bytes = Buffer.byteLength(command);
  if (bytes > MAX_COMMAND_BYTES) {
    throw new MesaError(
      'usage',
      `the goal makes a ${bytes}-byte command, over the ${MAX_COMMAND_BYTES} Mesa passes to tmux: shorten it, or keep the long part in a file the goal names`,
    );
  }
}

/** A session's goal, or not_found when it was started without one. */
export function sessionGoal(store: SessionStore, id: string): { id: string; goal: string } {
  const { goal } = store.get(id);
  if (goal === undefined) throw new MesaError('not_found', `session ${id} has no goal`);
  return { id, goal };
}
