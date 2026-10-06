import { MesaError } from '../lib/result.js';
import type { SessionRecord } from './record.js';
import type { Worktree } from './worktree.js';

// What `mesa open` asks for, and the one place that refuses flags that do not go together.

/** What `mesa open` asks for, the goal already read (readGoal). */
export type OpenInput = {
  project?: string;
  general?: boolean;
  agent?: string;
  mode?: string;
  /** Keep a Claude session running when its terminal view closes. */
  background?: boolean;
  goal?: string;
  automation?: SessionRecord['automation'];
  parent?: string;
  noParent?: boolean;
  /** Queued until this session is over (CONTEXT.md, Queued session). */
  after?: string;
  /** Its own git worktree on this branch (CONTEXT.md, Worktree), started from `base` if new. */
  branch?: string;
  base?: string;
  /** A shell in the project checkout, with no coding agent or provider conversation. */
  terminal?: boolean;
  /** An existing linked worktree it runs in (checkoutWorktree), in place of `branch`. */
  worktree?: Worktree;
  /** The imported item it starts from (mesa open --from), kept on the record. */
  from?: SessionRecord['from'];
  /**
   * Its additional projects (CONTEXT.md, Additional project), each in its own worktree on
   * `branch`, which the caller names when none is asked for.
   */
  with?: readonly string[];
};

/** The flags as asked, before Mesa names a branch or checks out a worktree. */
export type OpenFlags = Omit<OpenInput, 'worktree'> & {
  /** Its own worktree on a branch Mesa names (sessionBranchName): --worktree; --with implies it. */
  worktree?: boolean;
  /** An existing linked worktree to run in (checkoutWorktree). */
  checkout?: string;
};

/**
 * Refuses, as usage, flags that do not go together. Each refusal names them; the first that
 * applies is the one given.
 */
export function validateOpenInput(input: OpenFlags): void {
  const refuse = (message: string): never => {
    throw new MesaError('usage', message);
  };
  const extra = Boolean(input.with?.length);
  if (input.worktree && input.branch !== undefined) refuse('pass --worktree or --branch, not both');
  if (
    input.checkout !== undefined &&
    (input.worktree || input.branch !== undefined || extra || input.general || input.after)
  ) {
    refuse('--checkout cannot use --worktree, --branch, --with, --general, or --after');
  }
  if (Boolean(input.project) === Boolean(input.general)) {
    refuse('pass a project or --general, not both');
  }
  if (extra && (input.general || input.terminal)) {
    refuse('--with cannot use --general or --terminal: a session across projects runs an agent');
  }
  if (extra && input.branch === undefined && !input.worktree) {
    refuse('--with needs --branch or --worktree');
  }
  if (input.general && (input.branch || input.worktree || input.base || input.after)) {
    refuse('General sessions cannot use --branch, --base, or --after');
  }
  if (input.base !== undefined && input.branch === undefined && !input.worktree) {
    refuse('--base needs --branch');
  }
  if (input.mode !== undefined && input.mode !== 'plan') {
    refuse(`unknown session mode ${input.mode}; use plan`);
  }
  if (
    input.terminal &&
    (input.agent || input.goal || input.after || input.mode || input.background)
  ) {
    refuse('--terminal cannot use --agent, --goal, --after, --mode, or --background');
  }
  if (input.noParent && input.parent !== undefined) {
    refuse('pass --parent or --no-parent, not both');
  }
}
