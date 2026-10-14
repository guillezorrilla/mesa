import type { PrDetail } from '@mesa/core';
import { DEFAULT_APPEARANCE } from '@mesa/core/browser';
import { useMemo } from 'react';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import { DiffViewToggles } from '@/features/git/diff/DiffViewToggles';
import { diffFiles } from '@/features/git/diff/diffFiles';
import { GitDiffFiles } from '@/features/git/diff/GitDiffFiles';
import { useDiffView } from '@/features/git/diff/useDiffView';
import { useCommand } from '@/lib/useCommand';

/**
 * The PR's changed files with each one's diff, as the session's changes panel shows them. The
 * patch is read when the tab opens; until it arrives, or when it cannot be read, the files show
 * with their line counts.
 */
export function PrFilesTab(props: { pr: PrDetail }) {
  const { pr } = props;
  const diff = useCommand('prs.diff', { project: pr.project, number: pr.number });
  const appearance = useCommand('config.get').data?.appearance ?? DEFAULT_APPEARANCE;
  const files = useMemo(() => diffFiles(diff.data?.rows ?? []), [diff.data]);
  const view = useDiffView(files);
  if (!pr.files.length) return <Muted className="py-4">No changed files.</Muted>;
  if (!view.file)
    return (
      <>
        <Muted className="py-3">
          {diff.error
            ? `Could not read the changes: ${diff.error.message}`
            : diff.data
              ? 'No diff to show for these files.'
              : 'Reading the changes...'}
        </Muted>
        {pr.files.map((f) => (
          <div
            key={f.path}
            className="grid grid-cols-[1fr_auto] gap-4 border-b py-2 font-mono text-xs last:border-b-0"
          >
            <span className="truncate">{f.path}</span>
            <Stat added={f.additions} removed={f.deletions} />
          </div>
        ))}
      </>
    );
  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-end gap-1">
        <DiffViewToggles view={view} />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: j and k walk the files from any control inside. */}
      <div
        onKeyDown={view.walk}
        className="flex h-[70vh] min-h-80 overflow-hidden rounded-md border bg-card"
      >
        <GitDiffFiles
          files={files}
          at={view.at}
          onOpen={view.open}
          onMove={view.move}
          layout={view.layout}
          fontSize={appearance.diffFontSize}
          list={view.list}
          listClassName="w-56"
        />
      </div>
    </div>
  );
}
