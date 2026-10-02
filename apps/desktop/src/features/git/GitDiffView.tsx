import { Muted } from '@/components/Muted';
import { useCommand } from '@/lib/useCommand';
import { GitDiffRows } from './GitDiffRows';

type Target = {
  project: string;
  checkout?: string;
  path: string;
  layout: 'inline' | 'side-by-side';
  /** The profile's diff text size in px. */
  fontSize: number;
};

/** One changed file's diff against the whole file, so every unchanged run can unfold. */
export function GitDiffView(props: Target & { staged: boolean; untracked: boolean }) {
  return props.untracked ? <UntrackedDiff {...props} /> : <TrackedDiff {...props} />;
}

function TrackedDiff(props: Target & { staged: boolean }) {
  const diff = useCommand('git.diff', {
    project: props.project,
    checkout: props.checkout,
    path: props.path,
    staged: props.staged,
    full: true,
  });
  if (!diff.data) return diff.busy ? <Muted className="p-6">Loading diff...</Muted> : null;
  if (!diff.data.rows.length) return <Muted className="p-6">No diff in this selection.</Muted>;
  return <GitDiffRows rows={diff.data.rows} layout={props.layout} fontSize={props.fontSize} />;
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
