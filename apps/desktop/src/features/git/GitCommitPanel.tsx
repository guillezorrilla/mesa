import type { DiffRow, GitComparison, GitGraphCommit } from '@mesa/core';
import { Calendar, User, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';
import { GitDiffRows } from './diff/GitDiffRows';
import { branchRefs } from './GitCommitGraph';

type PatchFile = { path: string; rows: DiffRow[] };

/** A whole-commit patch cut at each `diff --git` header, one entry per file. */
export function patchFiles(rows: DiffRow[]): PatchFile[] {
  const files: PatchFile[] = [];
  for (const row of rows) {
    const header = row.kind === 'meta' && /^diff --git a\/.* b\/(.*)$/.exec(row.left);
    if (header) files.push({ path: header[1] ?? row.left, rows: [] });
    else files.at(-1)?.rows.push(row);
  }
  return files;
}

/** One commit's changes, or a two-ref comparison: the files on the left, the open file's diff. */
export function GitCommitPanel(props: {
  comparison: GitComparison;
  /** The graph commit compared with its first parent, when the panel shows one commit. */
  commit?: GitGraphCommit;
  layout: 'inline' | 'side-by-side';
  /** The profile's diff text size in px. */
  diffFontSize: number;
  onClose: () => void;
}) {
  const files = patchFiles(props.comparison.rows);
  const [open, setOpen] = useState(files[0]?.path);
  const file = files.find((each) => each.path === open) ?? files[0];
  const { commit, comparison } = props;
  return (
    <section aria-label="Git comparison" className="flex h-[45%] min-h-48 shrink-0 border-t">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="space-y-1 border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-state-working">
              {commit
                ? commit.oid.slice(0, 7)
                : `${comparison.base.slice(0, 7)}..${comparison.head.slice(0, 7)}`}
            </span>
            {commit &&
              branchRefs(commit.refs)
                .slice(0, 2)
                .map((name) => (
                  <span
                    key={name}
                    className="truncate rounded bg-state-working/15 px-1.5 py-0.5 text-[10px] font-medium text-state-working"
                  >
                    {name}
                  </span>
                ))}
            <IconButton
              label="Close commit"
              icon={X}
              size="icon-xs"
              className="ml-auto"
              onClick={props.onClose}
            />
          </div>
          {commit ? (
            <>
              <p className="truncate text-xs font-medium" title={commit.subject}>
                {commit.subject}
              </p>
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <User aria-hidden className="size-2.5 shrink-0" />
                  {commit.author}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Calendar aria-hidden className="size-2.5" />
                  {new Date(commit.authoredAt).toLocaleDateString()}
                </span>
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              {comparison.behind} behind, {comparison.ahead} ahead
            </p>
          )}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Changed files">
          {files.map((each) => {
            const slash = each.path.lastIndexOf('/');
            return (
              <li key={each.path}>
                <button
                  type="button"
                  aria-current={each === file || undefined}
                  title={each.path}
                  className={cn(
                    'w-full px-3 py-1.5 text-left text-sm text-foreground/85 hover:bg-accent/50',
                    each === file && 'bg-accent text-foreground hover:bg-accent',
                  )}
                  onClick={() => setOpen(each.path)}
                >
                  <span className="block truncate font-medium">{each.path.slice(slash + 1)}</span>
                  {slash > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {each.path.slice(0, slash + 1)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <Muted size="xs" className="border-t px-3 py-1.5">
          {files.length} {files.length === 1 ? 'file' : 'files'} changed
        </Muted>
      </aside>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3">
        {file ? (
          <GitDiffRows
            key={file.path}
            rows={file.rows}
            layout={props.layout}
            fontSize={props.diffFontSize}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            No file changes between these refs.
          </div>
        )}
      </div>
    </section>
  );
}
