import type { FollowedView } from '@mesa/core';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/**
 * The views this project follows, each with what it reads, Unfollow, and its name to edit in
 * place: Enter or leaving the field renames it, Esc puts the name back.
 */
export function ManageViewsDialog(props: {
  project: string;
  views: FollowedView[];
  onChanged: () => void;
  onRenamed: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const unfollow = (view: string) =>
    void act(async () => {
      if (await run('tickets.unfollow', { project: props.project, view })) props.onChanged();
      return undefined;
    });
  /** Renames `view` to what `field` holds, or puts its name back when that is empty or taken. */
  const rename = (view: string, field: HTMLInputElement) =>
    void act(async () => {
      const to = field.value.trim();
      if (to === view) return undefined;
      const renamed = to ? await run('tickets.viewsRename', { name: view, to }) : undefined;
      if (renamed) {
        props.onRenamed(view, renamed.name);
        props.onChanged();
      } else field.value = view;
      return undefined;
    });
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="manage-views-dialog"
        className="sm:max-w-lg"
        onEscapeKeyDown={(event) => {
          // Esc in a name being edited puts the name back; the next Esc closes.
          const field = document.activeElement;
          if (!(field instanceof HTMLInputElement) || field.dataset.view === undefined) return;
          event.preventDefault();
          field.value = field.dataset.view;
          field.blur();
        }}
      >
        <DialogHeader>
          <DialogTitle>Views in {props.project}</DialogTitle>
          <DialogDescription>
            Renaming changes the view in every project. Unfollowing keeps it for your other
            projects.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {props.views.map((view) => (
            <li key={view.name} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="group relative">
                  <Input
                    aria-label={`Name of ${view.name}`}
                    title="Rename"
                    data-view={view.name}
                    maxLength={60}
                    defaultValue={view.name}
                    disabled={acting}
                    className="-ml-1.5 h-7 border-transparent px-1.5 pr-7 font-medium shadow-none hover:border-input focus-visible:border-ring"
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                    onBlur={(event) => rename(view.name, event.currentTarget)}
                  />
                  <Pencil
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-0 group-hover:opacity-100"
                  />
                </span>
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
