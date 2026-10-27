import { cn } from '@/lib/utils';
import { folderOf, glyph, nameOf } from '../gitChanges';
import { DiffStatBar } from './DiffStatBar';
import type { DiffFile } from './diffFiles';

const STATUS_NAME = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed' } as const;

/**
 * One changed file's row: its status letter, its name, and its diffstat. With `indent` (a tree's
 * row) its name alone; without, its folder under its name.
 */
export function DiffFileRow(props: {
  file: DiffFile;
  current: boolean;
  /** Its left padding in px, as deep as its folder in a tree. */
  indent?: number;
  onOpen: (path: string) => void;
}) {
  const { file, current } = props;
  const folder = props.indent === undefined && folderOf(file.path);
  return (
    <button
      type="button"
      aria-current={current || undefined}
      title={`${STATUS_NAME[file.status]}: ${file.path}`}
      style={props.indent === undefined ? undefined : { paddingLeft: props.indent }}
      className={cn(
        'grid w-full grid-cols-[1ch_minmax(0,1fr)_auto] items-center gap-x-2 px-3 text-left hover:bg-accent/50',
        folder ? 'py-1.5' : 'py-1',
        current && 'bg-accent hover:bg-accent',
      )}
      onClick={() => props.onOpen(file.path)}
    >
      <span className={cn('font-mono text-xs font-semibold', glyph(file.status)[1])}>
        {file.status}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate text-sm',
            current ? 'font-medium text-foreground' : 'text-foreground/85',
            file.status === 'D' && 'line-through decoration-state-failed/60',
          )}
        >
          {nameOf(file.path)}
        </span>
        {folder && (
          <span className="block truncate text-[11px] text-muted-foreground">{folder}</span>
        )}
      </span>
      <DiffStatBar added={file.added} removed={file.removed} />
    </button>
  );
}
