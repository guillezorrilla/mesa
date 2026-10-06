import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import type { Runner } from '../lib/process.js';
import type { Profile } from '../profile/profile.js';
import type { SessionStore } from '../sessions/store.js';
import {
  checkoutFacts,
  cleanupFacts,
  present,
  projectWorktrees,
  type WorktreeAction,
} from './facts.js';
import type { WorktreeRow } from './inventory.js';
import { worktreeReasons } from './reasons.js';

export type WorktreePreview = {
  action: WorktreeAction;
  project: string;
  token: string;
  paths: string[];
  branch?: string;
  head?: string;
  state?: WorktreeRow['state'];
  holders: string[];
  changes: string[];
  ignored: string[];
  upstream?: string;
  ahead?: number;
  unpublished: boolean;
  teardown?: string[];
  destination?: string;
  /** The ref a recycle resets to. */
  base?: string;
  allowed: boolean;
  reasons: string[];
  /** A remove that `force` may apply anyway: every reason is local work, none a live session. */
  forceable: boolean;
};

const fingerprint = (facts: unknown) =>
  createHash('sha256').update(JSON.stringify(facts)).digest('hex');

/** Preview the exact Git registration and local work that an action would affect. */
export async function previewWorktreeAction(
  profile: Profile,
  run: Runner,
  store: SessionStore,
  project: string,
  action: WorktreeAction,
  selected?: string,
): Promise<WorktreePreview> {
  const worktrees = await projectWorktrees(profile, run, store, project);
  if (action === 'cleanup') {
    const facts = cleanupFacts(store, project, worktrees.root, worktrees.rows);
    const { blocked } = worktreeReasons(facts, action);
    const { missing: paths, holders } = facts;
    return {
      action,
      project,
      token: fingerprint({
        action,
        project,
        rows: facts.rows.map(({ path, head, branch, state }) => ({ path, head, branch, state })),
        paths,
        holders,
      }),
      paths,
      holders,
      changes: [],
      ignored: [],
      unpublished: false,
      allowed: !blocked.length,
      reasons: blocked,
      forceable: false,
    };
  }
  const facts = await checkoutFacts(profile, run, store, project, worktrees, action, selected);
  const { path, branch, head, holders, upstream, ahead, base } = facts;
  // The token covers every fact the decision and the apply rely on.
  const token = fingerprint({
    action,
    project,
    path,
    branch,
    head,
    state: facts.state,
    inode: facts.inode,
    device: facts.device,
    holders,
    status: facts.status,
    ignoredOutput: facts.ignoredOutput,
    upstream,
    ahead,
    unpublished: facts.unpublished,
    teardown: facts.teardown,
    base,
  });
  const destination =
    action === 'trash'
      ? join(profile.paths.root, 'recycle', project, `${basename(path)}-${token.slice(0, 12)}`)
      : undefined;
  const { blocked, work } = worktreeReasons(
    { ...facts, destinationTaken: Boolean(destination && present(destination)) },
    action,
  );
  const reasons = [...blocked, ...work];
  return {
    action,
    project,
    token,
    paths: [path],
    ...(branch ? { branch } : {}),
    ...(head ? { head } : {}),
    state: facts.state,
    holders,
    changes: facts.changes,
    ignored: facts.ignored,
    ...(upstream ? { upstream } : {}),
    ...(ahead === undefined ? {} : { ahead }),
    unpublished: facts.unpublished,
    ...(action === 'remove' ? { teardown: facts.teardown } : {}),
    ...(destination ? { destination } : {}),
    ...(base ? { base } : {}),
    allowed: !reasons.length,
    reasons,
    forceable: !blocked.length && work.length > 0,
  };
}
