import { cn } from '@/lib/utils';

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

/** A file's added and removed lines as five cells (tally). */
export function DiffStatBar(props: { added: number; removed: number }) {
  return (
    <span
      role="img"
      aria-label={`${props.added} added, ${props.removed} removed`}
      className="flex gap-px"
    >
      {tally(props.added, props.removed).map((cell, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: five fixed cells.
        <span key={index} className={cn('size-1.5 rounded-[1px]', CELL[cell])} />
      ))}
    </span>
  );
}
