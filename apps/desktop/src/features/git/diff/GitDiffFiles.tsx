import type { ReactNode } from 'react';
import { Stat } from '@/components/Stat';
import { DiffFileList } from './DiffFileList';
import { GitDiffHeader } from './GitDiffHeader';
import { GitDiffRows } from './GitDiffRows';
import type { DiffView } from './useDiffView';

/** A patch's changed files beside the open one's diff, inline or side by side. */
export function GitDiffFiles(props: {
  /** The files, which one is open, the list and the layout (useDiffView). */
  view: DiffView;
  /** The profile's diff text size in px. */
  fontSize: number;
  listClassName?: string;
  /** The open file's actions, in its header after its line counts. */
  actions?: ReactNode;
}) {
  const { view } = props;
  const { file } = view;
  if (!file) return null;
  return (
    <div className="flex min-h-0 flex-1">
      {view.list && (
        <DiffFileList
          files={view.files}
          tree={view.tree}
          open={file.path}
          onOpen={view.open}
          className={props.listClassName}
        />
      )}
      <section aria-label={file.path} className="flex min-w-0 flex-1 flex-col">
        <GitDiffHeader
          code={file.status}
          path={file.path}
          at={view.at}
          total={view.files.length}
          onMove={view.move}
        >
          <Stat added={file.added} removed={file.removed} />
          {props.actions}
        </GitDiffHeader>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <GitDiffRows
            key={`${file.path}:${view.layout}`}
            rows={file.rows}
            layout={view.layout}
            fontSize={props.fontSize}
          />
        </div>
      </section>
    </div>
  );
}
