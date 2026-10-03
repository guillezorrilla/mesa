import type { GitComparison, GitGraphCommit } from '@mesa/core';
import { ChartNoAxesColumn, GitCompareArrows, GitFork, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand, useRun } from '@/lib/useCommand';
import { GitCommitGraph } from './GitCommitGraph';
import { GitCommitPanel } from './GitCommitPanel';
import { GitInsight } from './GitInsight';

/** The Git tab's Graph view: the drawn commit graph, one commit's changes, and two-ref compare. */
export function GitHistory(props: {
  project: string;
  checkout?: string;
  /** The Status/Graph switch, first in the toolbar. */
  switcher: ReactNode;
  /** Toolbar buttons the Status view shares, before this view's own. */
  tools: ReactNode;
  layout: 'inline' | 'side-by-side';
  /** The profile's diff text size in px, for the comparison's patch. */
  diffFontSize: number;
}) {
  const [branch, setBranch] = useState('');
  const [panel, setPanel] = useState<'compare' | 'insight'>();
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [shown, setShown] = useState<{ comparison: GitComparison; commit?: GitGraphCommit }>();
  const target = { project: props.project, checkout: props.checkout };
  const branches = useCommand('git.branches', target);
  const graph = useCommand('git.graph', { ...target, branch: branch || undefined });
  const run = useRun();
  const commits = graph.data?.rows.flatMap((row) => (row.commit ? [row.commit] : [])) ?? [];
  const compare = async (from: string, to: string, commit?: GitGraphCommit) => {
    const comparison = await run('git.compare', { ...target, base: from, head: to });
    if (comparison) setShown({ comparison, commit });
  };
  const select = (commit: GitGraphCommit) => {
    setHead(commit.oid);
    if (shown?.commit?.oid === commit.oid) setShown(undefined);
    else if (commit.parents[0]) void compare(commit.parents[0], commit.oid, commit);
    // The root commit has no parent to compare with.
    else setShown(undefined);
  };
  const toggle = (name: 'compare' | 'insight') => setPanel(panel === name ? undefined : name);
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
        {props.switcher}
        <div className="w-52 shrink-0">
          <NativeSelect
            aria-label="Graph branch"
            size="sm"
            className="bg-background dark:bg-background"
            value={branch}
            onChange={(event) => {
              setBranch(event.target.value);
              setShown(undefined);
            }}
          >
            <NativeSelectOption value="">All branches</NativeSelectOption>
            {branches.data?.branches.map((row) => (
              <NativeSelectOption key={row.name} value={row.name}>
                {row.current ? `${row.name} (current)` : row.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {graph.data && (
          <span className="shrink-0 text-xs text-muted-foreground" title="At most 100 commits">
            {graph.data.commits} {graph.data.commits === 1 ? 'commit' : 'commits'}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {props.tools}
          <IconButton
            label="Compare refs"
            icon={GitCompareArrows}
            active={panel === 'compare'}
            onClick={() => toggle('compare')}
          />
          <IconButton
            label="Insights"
            icon={ChartNoAxesColumn}
            active={panel === 'insight'}
            onClick={() => toggle('insight')}
          />
          <IconButton
            label="Refresh"
            icon={RefreshCw}
            disabled={graph.busy}
            onClick={() => void Promise.all([graph.refresh(), branches.refresh()])}
          />
        </span>
      </div>
      {panel === 'compare' && (
        <form
          className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void compare(base, head);
          }}
        >
          <Input
            aria-label="Compare base"
            className="h-8 flex-1 font-mono text-xs"
            value={base}
            onChange={(event) => setBase(event.target.value)}
            placeholder="Base ref"
          />
          <Input
            aria-label="Compare head"
            className="h-8 flex-1 font-mono text-xs"
            value={head}
            onChange={(event) => setHead(event.target.value)}
            placeholder="Head ref or selected commit"
          />
          <Button type="submit" size="sm" disabled={!base.trim() || !head.trim()}>
            Compare
          </Button>
        </form>
      )}
      {panel === 'insight' && (
        <div className="max-h-[45%] shrink-0 overflow-y-auto border-b p-3">
          <GitInsight {...target} />
        </div>
      )}
      <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Git graph">
        {commits.length > 0 && (
          <GitCommitGraph commits={commits} selected={shown?.commit?.oid} onSelect={select} />
        )}
        {graph.data && !commits.length && (
          <div className="grid h-full place-items-center text-center text-muted-foreground">
            <div className="space-y-2">
              <GitFork aria-hidden className="mx-auto size-10 opacity-40" />
              <p className="text-sm">No commits found.</p>
            </div>
          </div>
        )}
        {!graph.data && graph.busy && <Muted className="p-4">Loading commits...</Muted>}
      </section>
      {shown && (
        <GitCommitPanel
          key={`${shown.comparison.base}:${shown.comparison.head}`}
          {...shown}
          layout={props.layout}
          diffFontSize={props.diffFontSize}
          onClose={() => setShown(undefined)}
        />
      )}
    </>
  );
}
