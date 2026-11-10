import type { ReactNode } from 'react';
import { ResizeHandle } from '@/components/ResizeHandle';
import { Stat } from '@/components/Stat';
import { useKeptWidth } from '@/lib/useKeptWidth';
import { DiffFileList } from './DiffFileList';
import { GitDiffHeader } from './GitDiffHeader';
import { GitDiffRows, type LineSlots } from './GitDiffRows';
import type { DiffView } from './useDiffView';

/** The file list's width bounds, default, and arrow-key step, in pixels; `wide` starts wider. */
const LIST_WIDTH = { min: 160, max: 720, initial: 224, step: 32 };
const WIDE_LIST_WIDTH = { ...LIST_WIDTH, initial: 288 };
/** The open file's diff keeps this many pixels beside the list. */
const OPEN_DIFF_MIN = 240;

/**
 * A patch's changed files beside the open one's diff, inline or side by side; the list's edge
 * resizes it.
 */
export function GitDiffFiles(props: {
  /** The files, which one is open, the list and the layout (useDiffView). */
  view: DiffView;
  /** The profile's diff text size in px. */
  fontSize: number;
  /** The open file's actions, in its header after its line counts. */
  actions?: ReactNode;
  /** A list that starts wider, until a width is kept: an expanded panel's. */
  wide?: boolean;
  /** What shows above the open file's rows, and on each of its lines (GitDiffRows). */
  before?: ReactNode;
  slots?: LineSlots;
  /** What shows under the file list, in its column. */
  listFooter?: ReactNode;
}) {
  const { view } = props;
  const { file } = view;
  const bounds = props.wide ? WIDE_LIST_WIDTH : LIST_WIDTH;
  const [width, setWidth] = useKeptWidth('mesa.diff.list.width', bounds);
  if (!file) return null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {view.list && (
        <div
          className="relative flex min-h-0 shrink-0"
          // The cap holds when the room shrinks after a drag (a narrower panel).
          style={{ width, maxWidth: `calc(100% - ${OPEN_DIFF_MIN}px)` }}
        >
          <div className="flex min-h-0 w-full flex-col">
            <DiffFileList
              files={view.files}
              tree={view.tree}
              open={file.path}
              onOpen={view.open}
              className="min-h-0 w-full flex-1"
            />
            {props.listFooter}
          </div>
          <ResizeHandle
            label="Resize file list"
            edge="right"
            width={width}
            bounds={bounds}
            keep={OPEN_DIFF_MIN}
            onWidth={setWidth}
          />
        </div>
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
          {props.before}
          <GitDiffRows
            key={`${file.path}:${view.layout}`}
            rows={file.rows}
            layout={view.layout}
            fontSize={props.fontSize}
            slots={props.slots}
          />
        </div>
      </section>
    </div>
  );
}
