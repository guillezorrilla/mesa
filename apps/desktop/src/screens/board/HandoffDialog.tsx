import type { ManagedRow } from '@mesa/core';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * Asks for the handoff note (a file) and hands the session off: a successor starts with its goal
 * and the note, and the session stops unless kept. One in its own worktree cannot be kept, as its
 * successor takes the worktree over.
 */
export function HandoffDialog(props: {
  row: ManagedRow;
  disabled: boolean;
  onHandoff: (note: string, keep: boolean) => void;
  onCancel: () => void;
}) {
  const platform = usePlatform();
  const [note, setNote] = useState<string>();
  const [keep, setKeep] = useState(false);
  const { row } = props;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="handoff-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hand off {row.name ?? row.id}</DialogTitle>
          <DialogDescription>
            A successor starts on {row.project} with its goal and your note, and reads the note
            first.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Handoff note</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="handoff-pick"
                onClick={async () => setNote((await platform.pickFile()) ?? note)}
              >
                <FileText aria-hidden />
                Pick note
              </Button>
              <span
                data-testid="handoff-note"
                title={note}
                className="truncate font-mono text-muted-foreground text-xs"
              >
                {note ?? 'what is verified, assumed, left out, and blocked'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="handoff-keep"
              data-testid="handoff-keep"
              checked={keep}
              disabled={Boolean(row.worktree)}
              onCheckedChange={(checked) => setKeep(checked === true)}
            />
            <Label htmlFor="handoff-keep" className="font-normal">
              {row.worktree ? 'It stops: its successor takes over its worktree' : 'Keep it running'}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            data-testid="handoff-submit"
            disabled={!note || props.disabled}
            onClick={() => note && props.onHandoff(note, keep)}
          >
            Hand off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
