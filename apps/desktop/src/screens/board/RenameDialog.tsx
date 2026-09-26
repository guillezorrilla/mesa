import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Names a session: the Board and `mesa sessions` show the name in place of its id. */
export function RenameDialog(props: {
  sessionId: string;
  name?: string;
  disabled: boolean;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="rename-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {props.sessionId}</DialogTitle>
          <DialogDescription>The Board shows the name in place of the id.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            props.onRename(String(new FormData(e.currentTarget).get('name') ?? ''));
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="rename-name">Name</Label>
            <Input
              id="rename-name"
              name="name"
              data-testid="rename-name"
              defaultValue={props.name}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button type="submit" data-testid="rename-submit" disabled={props.disabled}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
