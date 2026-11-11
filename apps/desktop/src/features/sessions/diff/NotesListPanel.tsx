import type { ListedNote } from '@mesa/core';
import { Copy, Eraser } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';
import { noteLabel } from './noteLabel';
import { NOTE_STATES, noteState, stateLabel } from './noteState';

/**
 * A session's notes across its files, beside the diff: grouped by file, each file's unsent first,
 * then sent, then changed since sent and stale; a click jumps to the note. Copy all copies every
 * note in the prompt's form; Clear sent deletes the sent ones whose lines have not changed.
 */
export function NotesListPanel(props: {
  notes: ListedNote[];
  busy: boolean;
  /** A session's name, for the session a sent note went to. */
  nameOf: (id: string) => string;
  onJump: (note: ListedNote) => void;
  onCopy: () => void;
  onClearSent: () => void;
}) {
  const files = [...new Set(props.notes.map((n) => n.path))].sort();
  const canClear = props.notes.some((n) => noteState(n) === 'sent');
  return (
    <aside aria-label="Notes" className="flex max-h-[50%] min-h-0 shrink-0 flex-col border-t">
      <header className="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-3">
        <span className="text-xs font-medium">Notes</span>
        <span className="ml-auto" />
        <IconButton
          label="Copy all notes"
          icon={Copy}
          size="icon-xs"
          disabled={!props.notes.length}
          onClick={props.onCopy}
        />
        <IconButton
          label="Clear sent notes"
          icon={Eraser}
          size="icon-xs"
          disabled={props.busy || !canClear}
          onClick={props.onClearSent}
        />
      </header>
      {!props.notes.length ? (
        <Muted size="xs" className="px-3 py-4">
          Hover a line and click its + to write a note.
        </Muted>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {files.map((path) => (
            <section key={path} aria-label={path} className="py-1">
              <p
                className="truncate px-3 py-1 font-mono text-xs text-muted-foreground"
                title={path}
              >
                {path}
              </p>
              {props.notes
                .filter((n) => n.path === path)
                .sort(
                  (a, b) =>
                    NOTE_STATES[noteState(a)].order - NOTE_STATES[noteState(b)].order ||
                    a.line - b.line,
                )
                .map((note) => {
                  const state = noteState(note);
                  return (
                    <button
                      key={note.id}
                      type="button"
                      className="grid w-full gap-0.5 px-3 py-1.5 text-left hover:bg-accent"
                      onClick={() => props.onJump(note)}
                    >
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {noteLabel(note)}
                        <span className={cn('ml-auto', NOTE_STATES[state].tone)}>
                          {stateLabel(note, props.nameOf)}
                        </span>
                      </span>
                      <span className="truncate text-sm">{note.text.split('\n')[0]}</span>
                    </button>
                  );
                })}
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}
