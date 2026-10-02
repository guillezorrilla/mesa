import { join } from 'node:path';

/**
 * Where a profile keeps its files, `<home>/.mesa/<profile>/`, and the name of its tmux socket. The
 * only module that knows the layout.
 */
export type ProfilePaths = {
  root: string;
  config: string;
  registry: string;
  sessions: string;
  /** The agent hooks' event logs, one `<session id>.jsonl` each. */
  events: string;
  /** Sessions' output logs, one `<session id>.log` each: local only, never in the vault. */
  logs: string;
  /** What each headless run's agent printed, `<session id>.json` each (CONTEXT.md, Skill run). */
  runs: string;
  /** Each Claude session's running estimated cost for its status line, `<session id>.json` each. */
  costs: string;
  /** The one-line scripts `mesa attach --app` hands to a terminal app. */
  attachScripts: string;
  /** Sessions' git worktrees, `<project>/<branch>` each (CONTEXT.md, Worktree). */
  worktrees: string;
  /** Repositories cloned from a URL for this profile. */
  checkouts: string;
  /** Handoff notes, `<successor id>.md` each (CONTEXT.md, Handoff). */
  handoffs: string;
  /** Profile-local normalized provider usage, independent of vault receipts. */
  usage: string;
  /** Read and clear markers for the profile-local notification inbox. */
  notifications: string;
  /** The PR events forwarded into sessions, so each is sent once (CONTEXT.md, PR event). */
  prEvents: string;
  /** Named, literal prompts saved only in this profile. */
  prompts: string;
  /** Optional profile-local automation rules, never installed implicitly. */
  automations: string;
  automationState: string;
  /** Failed or unattempted notes batches from change-aware source refresh. */
  pendingImportNotes: string;
  /** Local archives of settings, project registry, and saved prompts. */
  backups: string;
  /** ADR-0001: every profile has its own tmux server, never the user's. */
  tmuxSocket: string;
};

/** Where every profile's folder lives. */
export const profilesDir = (home: string) => join(home, '.mesa');

export function profilePaths(home: string, profile: string): ProfilePaths {
  const root = join(profilesDir(home), profile);
  return {
    root,
    config: join(root, 'config.yaml'),
    registry: join(root, 'registry.yaml'),
    sessions: join(root, 'sessions'),
    events: join(root, 'sessions', 'events'),
    logs: join(root, 'sessions', 'logs'),
    runs: join(root, 'sessions', 'runs'),
    costs: join(root, 'sessions', 'costs'),
    attachScripts: join(root, 'attach'),
    worktrees: join(root, 'worktrees'),
    checkouts: join(root, 'checkouts'),
    handoffs: join(root, 'handoffs'),
    usage: join(root, 'usage.json'),
    notifications: join(root, 'notifications.json'),
    prEvents: join(root, 'pr-events.json'),
    prompts: join(root, 'prompts.json'),
    automations: join(root, 'automations.yaml'),
    automationState: join(root, 'automation-state.yaml'),
    pendingImportNotes: join(root, 'pending-import-notes.yaml'),
    backups: join(root, 'backups'),
    tmuxSocket: `mesa-${profile}`,
  };
}
