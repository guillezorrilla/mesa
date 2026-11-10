import type { ListedNote } from '@mesa/core';
import { Check, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { cn } from '@/lib/utils';
import { NoteField } from './NoteField';

/** What a note is on, as its card and field say it. */
export const noteLabel = (note: { line: number; end: number }) =>
  note.line === 0
    ? 'File'
    : note.end > note.line
      ? `Lines ${note.line}-${note.end}`
      : `Line ${note.line}`;

/**
 * One saved note under its lines: what it is on, whether it is stale or was sent, its text, and
 * Edit and Delete. Editing sends it again with the next Send notes.
 */
export function NoteCard(props: {
  note: ListedNote;
  busy: boolean;
  onEdit: (text: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const { note } = props;
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
      aria-label={`Note on ${label.toLowerCase()}`}
      className={cn(
        'group/note my-1.5 rounded-md border-l-2 bg-muted/50 py-1.5 pr-1 pl-3 font-sans',
        note.stale
          ? 'border-state-waiting'
          : note.sentAt
            ? 'border-border'
            : 'border-state-working',
      )}
    >
      <header className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {note.stale ? (
          <span className="inline-flex items-center gap-1 text-state-waiting">
            <TriangleAlert aria-hidden className="size-3" /> Stale
          </span>
        ) : (
          note.sentAt && (
            <span className="inline-flex items-center gap-1">
              <Check aria-hidden className="size-3" /> Sent
            </span>
          )
        )}
        <span className="ml-auto flex opacity-0 transition-opacity group-hover/note:opacity-100 group-focus-within/note:opacity-100">
          <IconButton
            label="Edit note"
            icon={Pencil}
            size="icon-xs"
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
