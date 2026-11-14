import type { HunkPick } from '@mesa/core';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** What a diff of the index offers on each hunk: stage it from the unstaged diff, or unstage it. */
export type HunkAction = { staged: boolean; busy: boolean; onPick: (hunk: HunkPick) => void };

/** The band above one hunk: its range, as Git names it, and its stage or unstage button. */
export function HunkBar(props: { hunk: Required<HunkPick>; action: HunkAction }) {
  const { hunk, action } = props;
  const verb = action.staged ? 'Unstage' : 'Stage';
  const Icon = action.staged ? Minus : Plus;
  return (
    <div className="col-span-full mt-2 flex items-center justify-between gap-3 border-y border-border/60 bg-muted/40 py-0.5 pr-1 pl-3 font-sans text-xs text-muted-foreground first:mt-0">
      <span className="truncate font-mono">@@ {hunk.expect} @@</span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-label={`${verb} hunk ${hunk.index + 1}`}
        disabled={action.busy}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => action.onPick(hunk)}
      >
        <Icon aria-hidden />
        {verb} hunk
      </Button>
    </div>
  );
}
