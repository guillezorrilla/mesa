import type { HunkPick } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { warningOf } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import type { DiffLayout } from './GitDiffRows';
import { GitDiffRows } from './GitDiffRows';

type Target = {
  project: string;
  checkout?: string;
  path: string;
  layout: DiffLayout;
  /** The profile's diff text size in px. */
  fontSize: number;
};

/**
 * One changed file's diff against the whole file, so every unchanged run can unfold; a tracked
 * one stages or unstages a hunk at a time.
 */
export function GitDiffView(
  props: Target & {
    staged: boolean;
    untracked: boolean;
    /** After a hunk is staged or unstaged. */
    onChanged: () => void;
  },
) {
  return props.untracked ? <UntrackedDiff {...props} /> : <TrackedDiff {...props} />;
}

function TrackedDiff(props: Target & { staged: boolean; onChanged: () => void }) {
  const run = useRun();
  const { acting, act } = useAct();
  const pick = (hunk: HunkPick) =>
    act(async () => {
      const { project, checkout, path } = props;
      const done = await run(props.staged ? 'git.unstage' : 'git.stage', {
        project,
        checkout,
        path,
        hunk,
      });
      props.onChanged();
      return warningOf(done);
    });
  const diff = useCommand('git.diff', {
    project: props.project,
    checkout: props.checkout,
    path: props.path,
    staged: props.staged,
    full: true,
  });
  if (!diff.data) return diff.busy ? <Muted className="p-6">Loading diff...</Muted> : null;
  if (!diff.data.rows.length) return <Muted className="p-6">No diff in this selection.</Muted>;
  return (
    <GitDiffRows
      rows={diff.data.rows}
      layout={props.layout}
      fontSize={props.fontSize}
      hunks={{ staged: props.staged, busy: acting, onPick: (hunk) => void pick(hunk) }}
    />
  );
}

/** Git has no diff for a file it does not track yet: every line of it is an addition. */
function UntrackedDiff(props: Target) {
  const file = useCommand('files.read', {
    project: props.project,
    checkout: props.checkout,
    path: props.path,
  });
  if (!file.data) return file.busy ? <Muted className="p-6">Loading file...</Muted> : null;
  const rows = file.data.text
    .replace(/\n$/, '')
    .split('\n')
    .map((right, index) => ({ kind: 'change' as const, left: '', right, newLine: index + 1 }));
  return <GitDiffRows rows={rows} layout={props.layout} fontSize={props.fontSize} />;
}
