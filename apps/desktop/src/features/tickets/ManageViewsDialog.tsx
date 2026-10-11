import type { FollowedView } from '@mesa/core';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
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

/** A view's name being edited: the view, and what its field holds. */
type Editing = { view: string; text: string };

/**
 * The views this project follows, each with what it reads, Unfollow, and its name to edit in
 * place: Enter or leaving the field renames it, Esc puts the name back.
 */
export function ManageViewsDialog(props: {
  project: string;
  views: FollowedView[];
  /** What the tracker calls a followed view: view, or repo. */
  unit?: string;
  onChanged: () => void;
  onRenamed: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const [editing, setEditing] = useState<Editing>();
  const { unit = 'view' } = props;
  const Unit = `${unit[0]?.toUpperCase()}${unit.slice(1)}`;
  const edited = editing !== undefined && editing.text.trim() !== editing.view;
  const unfollow = (view: string) =>
    void act(async () => {
      if (await run('tickets.unfollow', { project: props.project, view })) props.onChanged();
      return undefined;
    });
  // Not through `act`: leaving the field by clicking Unfollow must not disable that click.
  /** Renames the view being edited; an empty or taken name puts its name back. */
  const rename = async () => {
    setEditing(undefined);
    if (!editing || !edited || !editing.text.trim()) return;
    const renamed = await run('tickets.viewsRename', { name: editing.view, to: editing.text });
    if (!renamed) return;
    props.onRenamed(editing.view, renamed.name);
    props.onChanged();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="manage-views-dialog"
        className="sm:max-w-lg"
        // Opening must not put a name in edit mode, its text selected for one key to replace.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          // Esc puts an edited name back; Esc again closes.
          if (!edited) return;
          event.preventDefault();
          setEditing({ view: editing.view, text: editing.view });
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {Unit}s in {props.project}
          </DialogTitle>
          <DialogDescription>
            Renaming changes the {unit} in every project. Unfollowing keeps it for your other
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
                    value={editing?.view === view.name ? editing.text : view.name}
                    className="-ml-1.5 h-7 border-transparent px-1.5 pr-7 font-medium shadow-none hover:border-input focus-visible:border-ring"
                    onFocus={() => setEditing({ view: view.name, text: view.name })}
                    onChange={(event) =>
                      setEditing({ view: view.name, text: event.currentTarget.value })
                    }
                    onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                    onBlur={() => void rename()}
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
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No {unit}s followed.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
