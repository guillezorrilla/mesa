import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';

/** The same Git patch as inline text or aligned old/new rows. */
export function GitDiffView(props: {
  project: string;
  checkout?: string;
  path?: string;
  onClose: () => void;
}) {
  const [staged, setStaged] = useState(false);
  const [layout, setLayout] = useState<'inline' | 'side-by-side'>('inline');
  const diff = useCommand('git.diff', {
    project: props.project,
    checkout: props.checkout,
    path: props.path,
    staged,
  });
  return (
    <section aria-label="Git diff" className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto truncate font-mono text-xs">{props.path ?? 'All files'}</span>
        <Button
          size="sm"
          variant={staged ? 'outline' : 'secondary'}
          onClick={() => setStaged(false)}
        >
          Working
        </Button>
        <Button
          size="sm"
          variant={staged ? 'secondary' : 'outline'}
          onClick={() => setStaged(true)}
        >
          Staged
        </Button>
        <Button
          size="sm"
          variant={layout === 'inline' ? 'secondary' : 'outline'}
          onClick={() => setLayout('inline')}
        >
          Inline
        </Button>
        <Button
          size="sm"
          variant={layout === 'side-by-side' ? 'secondary' : 'outline'}
          onClick={() => setLayout('side-by-side')}
        >
          Side by side
        </Button>
        <Button size="sm" variant="ghost" onClick={props.onClose}>
          Close
        </Button>
      </div>
      {diff.data &&
        (diff.data.patch ? (
          layout === 'inline' ? (
            <pre
              className="overflow-auto whitespace-pre font-mono text-xs"
              data-testid="git-inline-diff"
            >
              {diff.data.patch}
            </pre>
          ) : (
            <div className="overflow-auto font-mono text-xs" data-testid="git-side-diff">
              {diff.data.rows.map((row, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: Diff lines are immutable text with no child state.
                  key={index}
                  className="grid min-w-[40rem] grid-cols-2 border-b border-border/40"
                >
                  <span className="whitespace-pre-wrap break-all border-r pr-2">{row.left}</span>
                  <span className="whitespace-pre-wrap break-all pl-2">{row.right}</span>
                </div>
              ))}
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">No diff in this selection.</p>
        ))}
      {!diff.data && diff.busy && <p className="text-sm text-muted-foreground">Loading diff...</p>}
    </section>
  );
}
