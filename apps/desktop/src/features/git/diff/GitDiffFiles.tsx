import type { ReactNode } from 'react';
import { Stat } from '@/components/Stat';
import { DiffFileList } from './DiffFileList';
import type { DiffFile } from './diffFiles';
import { GitDiffHeader } from './GitDiffHeader';
import { GitDiffRows } from './GitDiffRows';

/** A patch's changed files beside the open one's diff, inline or side by side. */
export function GitDiffFiles(props: {
  files: DiffFile[];
  /** The open file's place in `files` (useOpenDiffFile). */
  at: number;
  onOpen: (path: string) => void;
  onMove: (step: -1 | 1) => void;
  layout: 'inline' | 'side-by-side';
  /** The profile's diff text size in px. */
  fontSize: number;
  /** Whether the file list shows; `listClassName` sizes it. */
  list: boolean;
  listClassName?: string;
  /** The open file's actions, in its header after its line counts. */
  actions?: ReactNode;
}) {
  const file = props.files[props.at];
  if (!file) return null;
  return (
    <div className="flex min-h-0 flex-1">
      {props.list && (
        <DiffFileList
          files={props.files}
          open={file.path}
          onOpen={props.onOpen}
          className={props.listClassName}
        />
      )}
      <section aria-label={file.path} className="flex min-w-0 flex-1 flex-col">
        <GitDiffHeader
          code={file.status}
          path={file.path}
          at={props.at}
          total={props.files.length}
          onMove={props.onMove}
        >
          <Stat added={file.added} removed={file.removed} />
          {props.actions}
        </GitDiffHeader>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <GitDiffRows
            key={`${file.path}:${props.layout}`}
            rows={file.rows}
            layout={props.layout}
            fontSize={props.fontSize}
          />
        </div>
      </section>
    </div>
  );
}
