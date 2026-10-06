import { createHash } from 'node:crypto';
import { gitCommand } from '../../git/command.js';
import { readGitDiff } from '../../git/diff.js';
import { literalPath } from '../../git/path.js';
import type { Runner } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import type { Profile } from '../../profile/profile.js';
import { GENERAL_PROJECT } from '../record/general.js';
import type { SessionStore } from '../record/store.js';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

type ChangeDeps = {
  profile: string;
  store: SessionStore;
  open: () => Profile;
  run: Runner;
};

export type ChangeReview = {
  profile: string;
  session: string;
  project: string;
  checkout: string;
  path: string;
  staged: boolean;
  baseKind: 'HEAD' | 'index';
  base: string;
  source: string;
  revision: string;
  hunks: { index: number; header: string; text: string }[];
};

export type ChangeReviewInput = {
  profile: string;
  path: string;
  staged: boolean;
  source: string;
  revision: string;
  hunk: number;
  comment: string;
};

export type ChangeReviewPreview = {
  id: string;
  target: string;
  source: string;
  revision: string;
  passage: string;
  comment: string;
  prompt: string;
  path: string;
  baseKind: 'HEAD' | 'index';
  base: string;
  staged: boolean;
};

/** Git's existing diff owner supplies a selected file's exact patch and checkout. */
export async function changeReview(
  deps: ChangeDeps,
  id: string,
  path: string,
  staged = false,
): Promise<ChangeReview> {
  const record = deps.store.get(id);
  if (record.kind !== 'interactive' || record.project === GENERAL_PROJECT)
    throw new MesaError('usage', 'change review needs a project agent session');
  if (!path) throw new MesaError('usage', 'select a changed file');
  const selected = record.worktree?.path ?? record.cwd;
  const diff = await readGitDiff(deps.open(), deps.run, record.project, selected, path, staged);
  if (Buffer.byteLength(diff.patch) > 1 << 20)
    throw new MesaError('usage', 'selected file diff exceeds 1 MiB');
  const head = await gitCommand(deps.run, diff.checkout.path, ['rev-parse', 'HEAD']);
  if (!head.ok) throw new MesaError('usage', `cannot read Git HEAD: ${head.detail}`);
  const baseKind = staged ? 'HEAD' : 'index';
  let base = head.stdout.trim();
  if (!staged) {
    const index = await gitCommand(deps.run, diff.checkout.path, [
      'ls-files',
      '--stage',
      '-z',
      '--',
      literalPath(path),
    ]);
    if (!index.ok) throw new MesaError('usage', `cannot read Git index: ${index.detail}`);
    const entry = index.stdout.match(/^\d+ ([0-9a-f]{40,64}) 0\t/);
    if (!entry) throw new MesaError('usage', 'selected file has no index base');
    base = entry[1] as string;
  }
  const starts = [...diff.patch.matchAll(/^@@ .*$/gm)].map((match) => match.index);
  const hunks = starts.map((start, index) => {
    const text = diff.patch.slice(start, starts[index + 1] ?? diff.patch.length);
    return { index, header: text.split('\n', 1)[0] ?? '', text };
  });
  return {
    profile: deps.profile,
    session: id,
    project: record.project,
    checkout: diff.checkout.path,
    path,
    staged,
    baseKind,
    base,
    source: sha(diff.patch),
    revision: sha(`${baseKind}\0${base}\0${diff.patch}`),
    hunks,
  };
}

/** Re-read the patch and HEAD before forming feedback; a changed hunk cannot be sent. */
export async function previewChangeReview(
  deps: ChangeDeps,
  id: string,
  input: ChangeReviewInput,
): Promise<ChangeReviewPreview> {
  if (input.profile !== deps.profile)
    throw new MesaError('usage', 'the change belongs to another Mesa profile');
  const change = await changeReview(deps, id, input.path, input.staged);
  if (change.source !== input.source || change.revision !== input.revision)
    throw new MesaError('locked', 'the Git diff or HEAD changed; choose the hunk again');
  const hunk = change.hunks[input.hunk];
  if (!Number.isInteger(input.hunk) || !hunk)
    throw new MesaError('usage', 'select a hunk from this diff');
  if (Buffer.byteLength(hunk.text) > 8 << 10)
    throw new MesaError('usage', 'selected hunk exceeds 8 KiB');
  if (
    !input.comment.trim() ||
    input.comment.includes('\0') ||
    Buffer.byteLength(input.comment) > 4 << 10
  )
    throw new MesaError('usage', 'review comment must be 1-4096 bytes and contain no NUL');
  const prompt = `Review ${input.staged ? 'staged' : 'working'} change in ${change.path} at ${change.baseKind} ${change.base} (patch ${change.source.slice(0, 12)}).\nQuoted hunk: ${JSON.stringify(hunk.text)}\nComment: ${input.comment}`;
  return {
    id: sha(
      JSON.stringify([
        id,
        input.path,
        input.staged,
        input.source,
        input.revision,
        input.hunk,
        input.comment,
      ]),
    ),
    target: id,
    source: change.source,
    revision: change.revision,
    passage: hunk.text,
    comment: input.comment,
    prompt,
    path: change.path,
    baseKind: change.baseKind,
    base: change.base,
    staged: change.staged,
  };
}
