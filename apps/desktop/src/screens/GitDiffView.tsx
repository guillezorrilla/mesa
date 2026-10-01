import { useCommand } from '@/lib/useCommand';
import { GitDiffRows } from './GitDiffRows';

type Target = {
  project: string;
  checkout?: string;
  path: string;
  layout: 'inline' | 'side-by-side';
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
  if (!diff.data) return diff.busy ? <Note>Loading diff...</Note> : null;
  if (!diff.data.rows.length) return <Note>No diff in this selection.</Note>;
  return <GitDiffRows rows={diff.data.rows} layout={props.layout} />;
}

/** Git has no diff for a file it does not track yet: every line of it is an addition. */
function UntrackedDiff(props: Target) {
  const file = useCommand('files.read', {
    project: props.project,
    checkout: props.checkout,
    path: props.path,
  });
  if (!file.data) return file.busy ? <Note>Loading file...</Note> : null;
  const rows = file.data.text
    .replace(/\n$/, '')
    .split('\n')
    .map((right, index) => ({ kind: 'change' as const, left: '', right, newLine: index + 1 }));
  return <GitDiffRows rows={rows} layout={props.layout} />;
}

function Note(props: { children: string }) {
  return <p className="p-6 text-sm text-muted-foreground">{props.children}</p>;
}
