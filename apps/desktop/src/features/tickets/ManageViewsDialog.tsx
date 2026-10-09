import type { FollowedView } from '@mesa/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** The views this project follows, each with what it reads and Unfollow. */
export function ManageViewsDialog(props: {
  project: string;
  views: FollowedView[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const unfollow = (view: string) =>
    void act(async () => {
      if (await run('tickets.unfollow', { project: props.project, view })) props.onChanged();
      return undefined;
    });
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent data-testid="manage-views-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Views in {props.project}</DialogTitle>
          <DialogDescription>Unfollowing keeps the view for your other projects.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {props.views.map((view) => (
            <li key={view.name} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="grid min-w-0 flex-1">
                <span className="font-medium">{view.name}</span>
                <span className="truncate text-xs text-muted-foreground">{view.describe}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={acting}
                onClick={() => unfollow(view.name)}
              >
                Unfollow
              </Button>
            </li>
          ))}
          {!props.views.length && (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No views followed.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
