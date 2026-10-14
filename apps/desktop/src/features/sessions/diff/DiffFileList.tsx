import { useEffect, useRef } from 'react';
import { folderOf, glyph, nameOf } from '@/features/git/gitChanges';
import { cn } from '@/lib/utils';
import type { DiffFile } from './diffFiles';

const STATUS_NAME = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed' } as const;
const CELL = { added: 'bg-state-idle', removed: 'bg-state-failed', empty: 'bg-muted' } as const;

/** Five cells split between added and removed, GitHub's diffstat: how heavy, and which way. */
export function tally(added: number, removed: number): ('added' | 'removed' | 'empty')[] {
  const total = added + removed;
  if (!total) return Array(5).fill('empty');
  const filled = Math.min(5, Math.max(1, Math.ceil(Math.log10(total + 1) * 2)));
  const green = Math.round((added / total) * filled);
  return Array.from({ length: 5 }, (_, i) =>
    i < green ? 'added' : i < filled ? 'removed' : 'empty',
  );
}

/** The changed files: name over folder, status letter, and each one's five-cell diffstat. */
export function DiffFileList(props: {
  files: DiffFile[];
  open: string;
  onOpen: (path: string) => void;
  className?: string;
}) {
  const list = useRef<HTMLUListElement>(null);
  // Focus in the list follows the open file, so j and k never leave the ring on the last one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a newly opened file moves the focus.
  useEffect(() => {
    if (list.current?.contains(document.activeElement))
      list.current.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [props.open]);
  return (
    <ul
      ref={list}
      aria-label="Changed files"
      className={cn('min-h-0 shrink-0 overflow-y-auto border-r py-1', props.className)}
    >
      {props.files.map((file) => {
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
                {folderOf(file.path) && (
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {folderOf(file.path)}
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
