import type { BrowseChild } from '@mesa/core';
import { DESCENDANTS_CAP } from '@mesa/core/browser';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Asks whether ticking `page` ticks the pages under it too. */
export function IncludeDescendantsDialog(props: {
  page: BrowseChild;
  onInclude: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onDismiss()}>
      <DialogContent data-testid="include-descendants-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Include the pages under {props.page.title}?</DialogTitle>
          <DialogDescription>
            Mesa ticks every page below it, children's children too, up to {DESCENDANTS_CAP}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={props.onDismiss}>
            Only this page
          </Button>
          <Button onClick={props.onInclude}>Include them</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
