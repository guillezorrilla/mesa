import type { PrDetail } from '@mesa/core';
import { DEFAULT_APPEARANCE } from '@mesa/core/browser';
import { Columns2, PanelLeft, Rows2 } from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import { diffFiles } from '@/features/git/diff/diffFiles';
import { GitDiffFiles } from '@/features/git/diff/GitDiffFiles';
import { useOpenDiffFile } from '@/features/git/diff/useOpenDiffFile';
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
  const { at, file, open, move } = useOpenDiffFile(files);
  const [listOpen, setListOpen] = useState(true);
  const [layout, setLayout] = useState<'inline' | 'side-by-side'>('inline');
  if (!pr.files.length) return <Muted className="py-4">No changed files.</Muted>;
  if (!file)
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
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    if (event.key !== 'j' && event.key !== 'k') return;
    event.preventDefault();
    move(event.key === 'j' ? 1 : -1);
  };
  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-end gap-1">
        <IconButton
          label={listOpen ? 'Hide file list' : 'Show file list'}
          icon={PanelLeft}
          active={listOpen}
          onClick={() => setListOpen(!listOpen)}
        />
        <IconButton
          label={layout === 'inline' ? 'Side-by-side diff' : 'Inline diff'}
          icon={layout === 'inline' ? Columns2 : Rows2}
          onClick={() => setLayout(layout === 'inline' ? 'side-by-side' : 'inline')}
        />
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: j and k walk the files from any control inside. */}
      <div
        onKeyDown={onKeyDown}
        className="flex h-[70vh] min-h-80 overflow-hidden rounded-md border bg-card"
      >
        <GitDiffFiles
          files={files}
          at={at}
          onOpen={open}
          onMove={move}
          layout={layout}
          fontSize={appearance.diffFontSize}
          list={listOpen}
          listClassName="w-56"
        />
      </div>
    </div>
  );
}
