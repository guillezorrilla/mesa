import { counted, DEFAULT_APPEARANCE } from '@mesa/core/browser';
import {
  Columns2,
  GitBranch,
  Maximize2,
  Minimize2,
  PanelLeft,
  RefreshCw,
  Rows2,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { ResizeHandle } from '@/components/ResizeHandle';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';
import { GitDiffHeader } from '@/features/git/diff/GitDiffHeader';
import { GitDiffRows } from '@/features/git/diff/GitDiffRows';
import { useCommand, useRun } from '@/lib/useCommand';
import { useKeptWidth } from '@/lib/useKeptWidth';
import { cn } from '@/lib/utils';
import { DiffFileList } from './DiffFileList';
import { diffFiles } from './diffFiles';

/** The panel's width bounds beside the terminal, which always keeps TERMINAL_MIN pixels. */
const DIFF_WIDTH = { min: 360, max: 1600, initial: 720, step: 32 };
const TERMINAL_MIN = 256;

/**
 * Everything the selected session changed since it left its base branch, beside its terminal:
 * the changed files and the open one's diff. A new session `state` (it went idle, or started
 * working) reads the changes again.
 */
export function DiffPanel(props: {
  sessionId: string;
  branch?: string;
  state: string;
  onClose: () => void;
}) {
  const changes = useCommand('sessions.diff', { id: props.sessionId });
  const data = changes.data;
  const appearance = useCommand('config.get').data?.appearance ?? DEFAULT_APPEARANCE;
  const run = useRun();
  const [width, setWidth] = useKeptWidth('mesa.diff.width', DIFF_WIDTH);
  const panel = useRef<HTMLElement>(null);
  // A drag stops where the terminal would drop below its minimum, so the edge never outruns the pointer.
  const resize = (next: number) => {
    const room = panel.current?.parentElement?.clientWidth;
    setWidth(room ? Math.min(next, room - TERMINAL_MIN) : next);
  };
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [layout, setLayout] = useState<'inline' | 'side-by-side'>('inline');
  const [openPath, setOpenPath] = useState<string>();
  const seenState = useRef(props.state);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new session state reads again.
  useEffect(() => {
    if (props.state === seenState.current) return;
    seenState.current = props.state;
    void changes.refresh();
  }, [props.state]);

  // Kept across renders, so a resize drag hands GitDiffRows the same rows and it skips the work.
  const files = useMemo(() => diffFiles(data?.rows ?? []), [data]);
  const at = Math.max(
    0,
    files.findIndex((file) => file.path === openPath),
  );
  const file = files[at];
  const move = (step: -1 | 1) => {
    const next = files[at + step];
    if (next) setOpenPath(next.path);
  };
  const added = files.reduce((sum, each) => sum + each.added, 0);
  const removed = files.reduce((sum, each) => sum + each.removed, 0);
  const expand = (next: boolean) => {
    setExpanded(next);
    setLayout(next ? 'side-by-side' : 'inline');
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      move(event.key === 'j' ? 1 : -1);
    } else if (event.key === 'Escape' && expanded) expand(false);
  };

  return (
    <aside
      ref={panel}
      aria-label="Session changes"
      onKeyDown={onKeyDown}
      className={cn(
        'flex h-full min-h-0 flex-col border-l bg-card',
        expanded ? 'absolute inset-0 z-20 border-l-0' : 'relative shrink-0',
      )}
      style={expanded ? undefined : { width, maxWidth: `calc(100% - ${TERMINAL_MIN}px)` }}
    >
      {!expanded && (
        <ResizeHandle
          label="Resize changes panel"
          edge="left"
          width={width}
          bounds={DIFF_WIDTH}
          onWidth={resize}
        />
      )}
      <header className="shrink-0 border-b">
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <GitBranch aria-hidden className="size-4 shrink-0 text-state-working" />
          <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
            <span className="truncate font-mono font-medium" title={props.branch}>
              {props.branch ?? 'This checkout'}
            </span>
            {data && (
              <span className="shrink-0 text-muted-foreground">
                since <span className="font-mono">{data.base}</span>
              </span>
            )}
          </p>
          <span className="ml-auto" />
          <IconButton
            label="Refresh changes"
            icon={RefreshCw}
            disabled={changes.busy}
            className={cn(changes.busy && '[&_svg]:animate-spin')}
            onClick={() => void changes.refresh()}
          />
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
          <IconButton
            label={expanded ? 'Shrink beside terminal' : 'Expand over terminal'}
            icon={expanded ? Minimize2 : Maximize2}
            onClick={() => expand(!expanded)}
          />
          <IconButton label="Close changes" icon={X} onClick={props.onClose} />
        </div>
        {data && (
          <div className="flex items-center gap-3 px-3 pb-2.5 text-xs text-muted-foreground">
            <span>{counted(data.ahead, 'commit')}</span>
            <span>{counted(files.length, 'file')}</span>
            <Stat added={added} removed={removed} />
            {data.omitted > 0 && (
              <span className="text-state-waiting">
                {counted(data.omitted, 'more new file')} not shown
              </span>
            )}
            <SplitBar added={added} removed={removed} />
          </div>
        )}
      </header>
      {!data ? (
        <Muted className="grid flex-1 place-items-center px-6 text-center">
          {changes.error
            ? `Could not read this session's changes: ${changes.error.message}`
            : 'Reading changes...'}
        </Muted>
      ) : !file ? (
        <div className="grid flex-1 place-content-center gap-1 px-6 text-center">
          <p className="text-sm font-medium">No changes since {data.base}</p>
          <Muted size="xs">
            Commits, edits and new files show up here as the session makes them.
          </Muted>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {listOpen && (
            <DiffFileList
              files={files}
              open={file.path}
              onOpen={setOpenPath}
              className={expanded ? 'w-72' : 'w-56'}
            />
          )}
          <section aria-label={file.path} className="flex min-w-0 flex-1 flex-col">
            <GitDiffHeader
              code={file.status}
              path={file.path}
              at={at}
              total={files.length}
              onMove={move}
            >
              <Stat added={file.added} removed={file.removed} />
              {file.status !== 'D' && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    void run('files.open', {
                      project: data.checkout.project,
                      checkout: data.checkout.path,
                      path: file.path,
                      line: file.firstLine,
                    })
                  }
                >
                  <SquareArrowOutUpRight aria-hidden /> Open in editor
                </Button>
              )}
            </GitDiffHeader>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <GitDiffRows
                key={`${file.path}:${layout}`}
                rows={file.rows}
                layout={layout}
                fontSize={appearance.diffFontSize}
              />
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}

/** The whole change's weight as one thin bar: green for added lines, red for removed. */
function SplitBar(props: { added: number; removed: number }) {
  const total = props.added + props.removed;
  if (!total) return null;
  return (
    <span aria-hidden className="ml-auto flex h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <span className="bg-state-idle" style={{ width: `${(props.added / total) * 100}%` }} />
      <span className="bg-state-failed" style={{ width: `${(props.removed / total) * 100}%` }} />
    </span>
  );
}
