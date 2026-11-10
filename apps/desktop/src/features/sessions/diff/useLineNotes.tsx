import type { DiffRow, ListedNote } from '@mesa/core';
import { Plus } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { LineSlots } from '@/features/git/diff/GitDiffRows';
import { cn } from '@/lib/utils';
import { NoteCard, noteLabel } from './NoteCard';
import { NoteField } from './NoteField';
import type { DiffNotes } from './useDiffNotes';

type Span = { line: number; end: number };

/**
 * One file's notes on the Session diff: a + in the gutter of every line on the new side (a click
 * writes a note on it, a drag over several on all of them), each saved note under its last line,
 * and above the lines its file notes and those whose lines are gone or not in this diff.
 */
export function useLineNotes(path: string | undefined, rows: DiffRow[], notes: DiffNotes) {
  const [draft, setDraft] = useState<Span & { path: string }>();
  const [drag, setDrag] = useState<{ from: number; to: number }>();
  // Write where the drag ended, when it ends anywhere.
  useEffect(() => {
    if (!drag || !path) return;
    const end = () => {
      setDraft({ path, line: Math.min(drag.from, drag.to), end: Math.max(drag.from, drag.to) });
      setDrag(undefined);
    };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, [drag, path]);

  const mine = notes.notes.filter((n) => n.path === path);
  const shown = useMemo(
    () => new Set(rows.flatMap((r) => (r.kind !== 'meta' && r.newLine ? [r.newLine] : []))),
    [rows],
  );
  const placed = (n: ListedNote) => n.line > 0 && !n.stale && shown.has(n.end);
  const open = draft?.path === path ? draft : undefined;

  const card = (note: ListedNote) => (
    <NoteCard
      key={note.id}
      note={note}
      busy={notes.acting}
      onEdit={(text) => notes.edit(note, text)}
      onDelete={() => void notes.remove(note)}
    />
  );
  const field = (span: Span) =>
    path && (
      <NoteField
        label={noteLabel(span)}
        busy={notes.acting}
        onCancel={() => setDraft(undefined)}
        onSave={(text) =>
          void notes.add(path, span.line, span.end, text).then((ok) => ok && setDraft(undefined))
        }
      />
    );

  const slots: LineSlots | undefined = path
    ? {
        held: new Set([...mine.filter(placed).map((n) => n.end), ...(open ? [open.end] : [])]),
        gutter: (n) => {
          const inDrag =
            drag && n >= Math.min(drag.from, drag.to) && n <= Math.max(drag.from, drag.to);
          return (
            <span
              className={cn(
                'absolute inset-y-0 left-0 flex items-center',
                inDrag && 'right-0 bg-state-working/20',
              )}
              onPointerOver={() => drag && drag.to !== n && setDrag({ ...drag, to: n })}
            >
              <button
                type="button"
                aria-label={`Add note on line ${n}`}
                title="Add note (drag for several lines)"
                className="ml-0.5 grid size-4 place-items-center rounded-sm bg-state-working text-background opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100"
                onPointerDown={(event) => {
                  event.preventDefault();
                  setDrag({ from: n, to: n });
                }}
                // A keyboard press, or a click the drag listener missed: this line, or the drag.
                onClick={() => {
                  const span = drag ?? { from: n, to: n };
                  setDrag(undefined);
                  setDraft({
                    path,
                    line: Math.min(span.from, span.to),
                    end: Math.max(span.from, span.to),
                  });
                }}
              >
                <Plus aria-hidden className="size-3" />
              </button>
            </span>
          );
        },
        below: (n) => {
          const here = mine.filter((note) => placed(note) && note.end === n);
          const writing = open && open.line > 0 && open.end === n;
          if (!here.length && !writing) return null;
          return (
            <div className="pl-12">
              {here.map(card)}
              {writing && field(open)}
            </div>
          );
        },
      }
    : undefined;

  const loose = mine.filter((n) => !placed(n));
  const before: ReactNode =
    loose.length || open?.line === 0 ? (
      <div className="mb-2">
        {loose.map(card)}
        {open?.line === 0 && field(open)}
      </div>
    ) : null;

  return {
    slots,
    before,
    addFileNote: () => path && setDraft({ path, line: 0, end: 0 }),
  };
}
