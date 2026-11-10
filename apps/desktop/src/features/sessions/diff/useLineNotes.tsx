import type { DiffRow, ListedNote } from '@mesa/core';
import { Plus } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { LineSlots } from '@/features/git/diff/GitDiffRows';
import { cn } from '@/lib/utils';
import { NoteCard } from './NoteCard';
import { NoteField } from './NoteField';
import { noteLabel } from './noteLabel';
import type { DiffNotes } from './useDiffNotes';

type Drag = { from: number; to: number };
type Draft = { path: string; line: number; end: number };

/** The lines a drag covers, first to last, whichever way it went. */
const spanOf = (drag: Drag) => ({
  line: Math.min(drag.from, drag.to),
  end: Math.max(drag.from, drag.to),
});

/**
 * One file's notes on the Session diff: a + in the gutter of every line on the new side (a click
 * writes a note on it, a drag over several on all of them), each saved note under its last line,
 * and above the lines its file notes and those whose lines are gone or not in this diff.
 */
export function useLineNotes(path: string | undefined, rows: DiffRow[], notes: DiffNotes) {
  const [draft, setDraft] = useState<Draft>();
  const [drag, setDrag] = useState<Drag>();
  // Write where the drag ended, when it ends anywhere.
  useEffect(() => {
    if (!drag || !path) return;
    const end = () => {
      setDraft({ path, ...spanOf(drag) });
      setDrag(undefined);
    };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, [drag, path]);

  const shown = useMemo(
    () => new Set(rows.flatMap((r) => (r.kind !== 'meta' && r.newLine ? [r.newLine] : []))),
    [rows],
  );
  const { acting, add, edit, remove, resolve } = notes;
  const mine = useMemo(() => notes.notes.filter((n) => n.path === path), [notes.notes, path]);
  const open = draft?.path === path ? draft : undefined;

  // Kept while nothing here changes, so a parent re-rendering on every frame (a panel resize)
  // leaves GitDiffRows alone. shortcut: a note drag re-renders every line it crosses; a range
  // highlight in CSS would spare that if a large diff lags.
  const view = useMemo(() => {
    const placed = (n: ListedNote) => n.line > 0 && !n.stale && shown.has(n.end);
    const card = (note: ListedNote) => (
      <NoteCard
        key={note.id}
        note={note}
        busy={acting}
        onEdit={(text) => edit(note, text)}
        onDelete={() => void remove(note)}
        onResolve={() => void resolve(note)}
      />
    );
    const field = (at: Draft) => (
      <NoteField
        label={noteLabel(at)}
        busy={acting}
        onCancel={() => setDraft(undefined)}
        onSave={(text) =>
          void add(at.path, at.line, at.end, text).then(
            // Only this draft closes: another opened meanwhile stays.
            (ok) => ok && setDraft((current) => (current === at ? undefined : current)),
          )
        }
      />
    );
    const range = drag && spanOf(drag);
    const slots: LineSlots | undefined = path
      ? {
          held: new Set([...mine.filter(placed).map((n) => n.end), ...(open ? [open.end] : [])]),
          gutter: (n) => (
            <span
              className={cn(
                'absolute inset-y-0 left-0 flex items-center',
                range && n >= range.line && n <= range.end && 'right-0 bg-state-working/20',
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
                  setDraft({ path, ...spanOf(drag ?? { from: n, to: n }) });
                  setDrag(undefined);
                }}
              >
                <Plus aria-hidden className="size-3" />
              </button>
            </span>
          ),
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
    return { slots, before };
  }, [path, mine, shown, open, drag, acting, add, edit, remove, resolve]);

  return {
    ...view,
    addFileNote: () => path && setDraft({ path, line: 0, end: 0 }),
  };
}
