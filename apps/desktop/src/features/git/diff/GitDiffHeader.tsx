import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';
import { glyph } from '../gitChanges';

/** The open change's status letter and path, `children` (its actions), its place in the list, and previous/next. */
export function GitDiffHeader(props: {
  /** Git's status letter; `?` (untracked) shows as U. */
  code: string;
  path: string;
  at: number;
  total: number;
  onMove: (step: -1 | 1) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
      <span className={cn('font-mono text-sm', glyph(props.code)[1])}>
        {props.code === '?' ? 'U' : props.code}
      </span>
      <span
        className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground"
        title={props.path}
      >
        {props.path}
      </span>
      {props.children}
      <span className="text-xs text-muted-foreground">
        {props.at + 1} / {props.total}
      </span>
      <IconButton
        label="Previous change"
        icon={ChevronUp}
        disabled={props.at === 0}
        onClick={() => props.onMove(-1)}
      />
      <IconButton
        label="Next change"
        icon={ChevronDown}
        disabled={props.at === props.total - 1}
        onClick={() => props.onMove(1)}
      />
    </div>
  );
}
