import { ChevronDown, ChevronUp } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';
import { type GitEntry, glyph } from '../gitChanges';

/** The open change's status letter and path, its place in the list, and previous/next. */
export function GitDiffHeader(props: {
  entry: GitEntry;
  at: number;
  total: number;
  onMove: (step: -1 | 1) => void;
}) {
  const { change, code } = props.entry;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
      <span className={cn('font-mono text-sm', glyph(code)[1])}>{code === '?' ? 'U' : code}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
        {change.oldPath ? `${change.oldPath} -> ${change.path}` : change.path}
      </span>
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
