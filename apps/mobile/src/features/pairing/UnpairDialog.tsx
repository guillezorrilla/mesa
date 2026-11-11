import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Text } from '@/components/ui/text';

/** Unpair, after a confirmation: the pairing ends here and on the broker. */
export function UnpairDialog({ onUnpair }: { onUnpair: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Text>Unpair</Text>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unpair from your Mac?</DialogTitle>
          <DialogDescription>
            This phone stops getting Mesa's notices until you pair it again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">
              <Text>Cancel</Text>
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              await onUnpair();
            }}
          >
            <Text>Unpair</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
