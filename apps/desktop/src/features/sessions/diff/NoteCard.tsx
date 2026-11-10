import type { ListedNote } from '@mesa/core';
import { Check, CheckCheck, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';
import { NoteField } from './NoteField';
import { noteLabel } from './noteLabel';
import { NOTE_STATES, noteState } from './noteState';

/**
 * One saved note under its lines: what it is on, whether it is stale or was sent, its text, and
 * Edit and Delete. Editing sends it again with the next Send notes.
 */
export function NoteCard(props: {
  note: ListedNote;
  busy: boolean;
  onEdit: (text: string) => Promise<boolean>;
  onDelete: () => void;
  onResolve: () => void;
}) {
  const { note } = props;
  const state = noteState(note);
  const [editing, setEditing] = useState(false);
  const label = noteLabel(note);
  if (editing)
    return (
      <NoteField
        label={label}
        initial={note.text}
        busy={props.busy}
        onCancel={() => setEditing(false)}
        onSave={(text) => void props.onEdit(text).then((ok) => ok && setEditing(false))}
      />
    );
  return (
    <article
      id={`note-${note.id}`}
      aria-label={`Note on ${label.toLowerCase()}`}
      className={cn(
        'group/note my-1.5 scroll-mt-3 rounded-md border-l-2 bg-muted/50 py-1.5 pr-1 pl-3 font-sans',
        state === 'unsent' && 'border-state-working',
        state === 'sent' && 'border-border',
        (state === 'changed' || state === 'stale') && 'border-state-waiting',
      )}
    >
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {state !== 'unsent' && (
          <span
            className={cn(
              'inline-flex items-center gap-1',
              state !== 'sent' && 'text-state-waiting',
            )}
          >
            {state === 'sent' ? (
              <Check aria-hidden className="size-3" />
            ) : (
              <TriangleAlert aria-hidden className="size-3" />
            )}
            {NOTE_STATES[state].label}
          </span>
        )}
        <span className="ml-auto flex opacity-0 transition-opacity group-hover/note:opacity-100 group-focus-within/note:opacity-100">
          {state === 'changed' && (
            <IconButton
              label="Resolve note"
              icon={CheckCheck}
              size="icon-xs"
              disabled={props.busy}
              onClick={props.onResolve}
            />
          )}
          <IconButton
            label="Edit note"
            icon={Pencil}
            size="icon-xs"
            disabled={props.busy}
            onClick={() => setEditing(true)}
          />
          <IconButton
            label="Delete note"
            icon={Trash2}
            size="icon-xs"
            disabled={props.busy}
            onClick={props.onDelete}
          />
        </span>
      </header>
      <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{note.text}</p>
    </article>
  );
}
