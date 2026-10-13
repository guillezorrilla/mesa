import { cn } from '@/lib/utils';
import { type DiffFile, tally } from './diffFiles';

export const STATUS_TONE: Record<DiffFile['status'], string> = {
  A: 'text-state-idle',
  M: 'text-state-waiting',
  D: 'text-state-failed',
  R: 'text-state-working',
};
const STATUS_NAME = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed' } as const;
const CELL = { added: 'bg-state-idle', removed: 'bg-state-failed', empty: 'bg-muted' } as const;

/** Added and removed line counts, as +12 -3. */
export function Stat(props: { added: number; removed: number }) {
  return (
    <span className="shrink-0 font-mono text-xs tabular-nums">
      <span className="text-state-idle">+{props.added}</span>{' '}
      <span className="text-state-failed">-{props.removed}</span>
    </span>
  );
}

/** The changed files: name over folder, status letter, and each one's five-cell diffstat. */
export function DiffFileList(props: {
  files: DiffFile[];
  open: string;
  onOpen: (path: string) => void;
  className?: string;
}) {
  return (
    <ul
      aria-label="Changed files"
      className={cn('min-h-0 shrink-0 overflow-y-auto border-r py-1', props.className)}
    >
      {props.files.map((file) => {
        const slash = file.path.lastIndexOf('/');
        const current = file.path === props.open;
        return (
          <li key={file.path}>
            <button
              type="button"
              aria-current={current || undefined}
              title={`${STATUS_NAME[file.status]}: ${file.path}`}
              className={cn(
                'grid w-full grid-cols-[1ch_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1.5 text-left hover:bg-accent/50',
                current && 'bg-accent hover:bg-accent',
              )}
              onClick={() => props.onOpen(file.path)}
            >
              <span className={cn('font-mono text-xs font-semibold', STATUS_TONE[file.status])}>
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
                  {file.path.slice(slash + 1)}
                </span>
                {slash > 0 && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {file.path.slice(0, slash)}
                  </span>
                )}
              </span>
              <span
                role="img"
                aria-label={`${file.added} added, ${file.removed} removed`}
                className="flex gap-px"
              >
                {tally(file.added, file.removed).map((cell, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: five fixed cells.
                  <span key={index} className={cn('size-1.5 rounded-[1px]', CELL[cell])} />
                ))}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
