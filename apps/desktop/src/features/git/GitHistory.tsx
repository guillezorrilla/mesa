import type { GitComparison } from '@mesa/core';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand, useRun } from '@/lib/useCommand';

/** Bounded local commit graph and explicit two-ref comparison. */
export function GitHistory(props: {
  project: string;
  checkout?: string;
  /** The profile's diff text size in px, for the comparison's patch. */
  diffFontSize: number;
}) {
  const [branch, setBranch] = useState('');
  const [base, setBase] = useState('');
  const [head, setHead] = useState('');
  const [comparison, setComparison] = useState<GitComparison>();
  const branches = useCommand('git.branches', { project: props.project, checkout: props.checkout });
  const graph = useCommand('git.graph', {
    project: props.project,
    checkout: props.checkout,
    branch: branch || undefined,
  });
  const run = useRun();
  const compare = async () => {
    const result = await run('git.compare', {
      project: props.project,
      checkout: props.checkout,
      base,
      head,
    });
    if (result) setComparison(result);
  };
  return (
    <section aria-label="Git graph" className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Commit graph</h3>
        <NativeSelect
          aria-label="Graph branch"
          className="max-w-52"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
        >
          <NativeSelectOption value="">All branches</NativeSelectOption>
          {branches.data?.branches.map((row) => (
            <NativeSelectOption key={row.name} value={row.name}>
              {row.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {graph.data?.rows.length === 0 && <Muted>No commits.</Muted>}
      <ul className="max-h-80 overflow-auto font-mono text-xs" aria-label="Commits">
        {graph.data?.rows.map((row, index) => (
          <li
            key={row.commit?.oid ?? `lane-${index}`}
            className="flex min-w-max items-start gap-2 py-0.5"
          >
            <pre className="text-primary">{row.graph}</pre>
            {row.commit && (
              <button
                type="button"
                className="text-left hover:text-primary"
                title={`${row.commit.author} · ${row.commit.authoredAt}`}
                onClick={() => setHead(row.commit?.oid ?? '')}
              >
                <span className="text-muted-foreground">{row.commit.oid.slice(0, 7)}</span>{' '}
                {row.commit.subject}
              </button>
            )}
          </li>
        ))}
      </ul>
      {graph.data && (
        <Muted size="xs">
          Showing {graph.data.commits} of at most 100 commits. Select a commit to compare it.
        </Muted>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void compare();
        }}
      >
        <Input
          aria-label="Compare base"
          className="min-w-36 flex-1"
          value={base}
          onChange={(event) => setBase(event.target.value)}
          placeholder="Base ref"
        />
        <Input
          aria-label="Compare head"
          className="min-w-36 flex-1"
          value={head}
          onChange={(event) => setHead(event.target.value)}
          placeholder="Head ref or selected commit"
        />
        <Button type="submit" disabled={!base.trim() || !head.trim()}>
          Compare
        </Button>
      </form>
      {comparison && (
        <section aria-label="Git comparison" className="space-y-2 border-t pt-3">
          <p className="text-sm">
            <span className="font-mono">{comparison.base.slice(0, 7)}</span> to{' '}
            <span className="font-mono">{comparison.head.slice(0, 7)}</span>: {comparison.behind}{' '}
            behind, {comparison.ahead} ahead
          </p>
          {comparison.patch ? (
            <pre
              className="max-h-80 overflow-auto whitespace-pre font-mono"
              style={{ fontSize: props.diffFontSize }}
            >
              {comparison.patch}
            </pre>
          ) : (
            <Muted>No file changes between these refs.</Muted>
          )}
        </section>
      )}
    </section>
  );
}
