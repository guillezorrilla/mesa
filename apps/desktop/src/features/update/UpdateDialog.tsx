import { CircleArrowUp, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { describeUpdate, useUpdate } from './useUpdate';

/**
 * The updater's dialogs, in their own React root (main.tsx) so a broken screen still updates:
 * a downloaded update ready to install, a newer version this build cannot install itself, and,
 * blocking, a running version that was revoked.
 */
export function UpdateDialog() {
  const { status, busy, check, later, install, openPage, quit } = useUpdate();
  if (!status) return null;
  const ready = status.phase === 'ready';
  if (status.revoked) {
    return (
      <Dialog open>
        <DialogContent
          data-testid="update-revoked"
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert aria-hidden className="size-5 text-destructive" />
              This version of Mesa was withdrawn
            </DialogTitle>
            <DialogDescription>{status.revoked.reason}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{describeUpdate(status)}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => void quit()}>
              Quit
            </Button>
            {ready ? (
              <Button onClick={() => void install()}>Install v{status.version}</Button>
            ) : (
              <Button disabled={busy} onClick={() => void check()}>
                Check for update
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  const unsupported = status.phase === 'unsupported';
  if ((!ready && !unsupported) || status.dismissed) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && void later()}>
      <DialogContent data-testid="update-ready" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleArrowUp aria-hidden className="size-5 text-ring" />
            Update Mesa
          </DialogTitle>
          <DialogDescription>
            {ready ? `v${status.version} is ready to install.` : `v${status.version} is available.`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {ready ? 'Active sessions will not be interrupted.' : status.message}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => void later()}>
            Later
          </Button>
          {ready ? (
            <Button onClick={() => void install()}>Install</Button>
          ) : (
            <Button onClick={() => void openPage()}>Open download page</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
