import type { MergeMethod } from '@mesa/core';
import { MERGE_LABELS } from '@mesa/core/browser';
import { Clock } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** GitHub auto-merge is on: the method it will merge with, and Cancel auto-merge to turn it off. */
export function AutoMergeLine(props: { method: MergeMethod; onCancel: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    setBusy(true);
    await props.onCancel();
    setBusy(false);
  };
  return (
    <div data-testid="auto-merge-on" className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
        <Clock aria-hidden className="size-3.5 text-primary" />
        Merges when checks pass · {MERGE_LABELS[props.method]}
      </span>
      <Button
        size="sm"
        variant="outline"
        data-testid="cancel-auto-merge"
        disabled={busy}
        onClick={() => void cancel()}
      >
        Cancel auto-merge
      </Button>
    </div>
  );
}
