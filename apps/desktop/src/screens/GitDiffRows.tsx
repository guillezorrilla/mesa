import type { DiffRow } from '@mesa/core';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import { Fragment, useState } from 'react';
import { cn } from '@/lib/utils';

/** Unchanged lines kept open on each side of a change; longer runs fold. */
const CONTEXT = 3;
const HATCH =
  'bg-[repeating-linear-gradient(135deg,var(--color-border)_0,var(--color-border)_1px,transparent_1px,transparent_7px)]';

type Line = DiffRow & { kind: 'context' | 'change' };
type Piece = { line: Line } | { fold: Line[]; at: number };
/** Each side's line number appears once per file, so the pair keys a row. */
const keyOf = (line: Line) => `${line.oldLine ?? ''}:${line.newLine ?? ''}`;

/** Lines near a change, with each longer unchanged run as one fold. */
function pieces(lines: Line[]): Piece[] {
  const near = lines.map((_, i) =>
    lines.slice(Math.max(0, i - CONTEXT), i + CONTEXT + 1).some((line) => line.kind === 'change'),
  );
  const out: Piece[] = [];
  lines.forEach((line, i) => {
    const last = out.at(-1);
    if (near[i]) out.push({ line });
    else if (last && 'fold' in last) last.fold.push(line);
    else out.push({ fold: [line], at: i });
  });
  return out;
}

/** Inline reads a change block as all of its removed lines, then all of its added ones. */
function unified(lines: Line[]): Line[] {
  const out: Line[] = [];
  for (let i = 0; i < lines.length; ) {
    if (lines[i]?.kind !== 'change') {
      out.push(lines[i++] as Line);
      continue;
    }
    const block: Line[] = [];
    while (lines[i]?.kind === 'change') block.push(lines[i++] as Line);
    for (const { oldLine, left } of block)
      if (oldLine !== undefined) out.push({ kind: 'change', left, right: '', oldLine });
    for (const { newLine, right } of block)
      if (newLine !== undefined) out.push({ kind: 'change', left: '', right, newLine });
  }
  return out;
}

/** Side-by-side or inline rows of one file's diff, unchanged runs folded as the reference app does. */
export function GitDiffRows(props: {
  rows: DiffRow[];
  layout: 'inline' | 'side-by-side';
  /** The profile's diff text size in px. */
  fontSize: number;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const lines = props.rows.filter((row): row is Line => row.kind !== 'meta');
  const notes = props.rows.filter(
    (row) => row.kind === 'meta' && !/^(diff |index |--- |\+\+\+ |@@)/.test(row.left),
  );
  const side = props.layout === 'side-by-side';
  const shown = pieces(side ? lines : unified(lines));
  return (
    <div
      data-testid={side ? 'git-side-diff' : 'git-inline-diff'}
      style={{ fontSize: props.fontSize }}
      className={cn(
        'grid font-mono leading-6',
        side
          ? 'grid-cols-[3rem_minmax(0,1fr)_3rem_minmax(0,1fr)]'
          : 'grid-cols-[3rem_3rem_1.25rem_minmax(0,1fr)]',
      )}
    >
      {notes.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Diff lines are immutable text with no child state.
        <p key={index} className="col-span-full px-3 py-1 text-muted-foreground">
          {row.left}
        </p>
      ))}
      {shown.map((piece, index) => {
        if ('line' in piece) return <Rows key={keyOf(piece.line)} line={piece.line} side={side} />;
        if (open.has(piece.at))
          return (
            <Fragment key={`fold:${piece.at}`}>
              {piece.fold.map((line) => (
                <Rows key={keyOf(line)} line={line} side={side} />
              ))}
            </Fragment>
          );
        const Icon =
          index === 0 ? ChevronUp : index === shown.length - 1 ? ChevronDown : ChevronsUpDown;
        return (
          <button
            key={`fold:${piece.at}`}
            type="button"
            className="col-span-full my-1 flex items-center rounded-md bg-muted/70 text-left font-sans text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => setOpen((last) => new Set(last).add(piece.at))}
          >
            <span className="flex w-12 shrink-0 justify-center self-stretch border-r border-background py-2">
              <Icon aria-hidden className="size-4" />
            </span>
            <span className="px-3">
              {piece.fold.length} unmodified {piece.fold.length === 1 ? 'line' : 'lines'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One unchanged line, or one aligned removed/added pair, in the chosen layout. */
function Rows(props: { line: Line; side: boolean }) {
  const { line } = props;
  const removed = line.kind === 'change' && line.oldLine !== undefined;
  const added = line.kind === 'change' && line.newLine !== undefined;
  const number = 'select-none pr-3 text-right text-muted-foreground';
  const text = 'whitespace-pre-wrap break-all pl-2 pr-3';
  if (props.side)
    return (
      <>
        <span
          className={cn(
            number,
            removed && 'border-l-2 border-state-failed bg-state-failed/15 text-state-failed',
          )}
        >
          {line.oldLine}
        </span>
        <span
          className={cn(
            text,
            removed && 'bg-state-failed/10',
            line.kind === 'change' && !removed && HATCH,
          )}
        >
          {line.left}
        </span>
        <span
          className={cn(
            number,
            'border-l',
            added && 'border-l-2 border-state-idle bg-state-idle/15 text-state-idle',
          )}
        >
          {line.newLine}
        </span>
        <span
          className={cn(
            text,
            added && 'bg-state-idle/10',
            line.kind === 'change' && !added && HATCH,
          )}
        >
          {line.right}
        </span>
      </>
    );
  if (line.kind === 'context')
    return <InlineLine old={line.oldLine} next={line.newLine} sign=" " text={line.left} />;
  return (
    <>
      {removed && <InlineLine old={line.oldLine} sign="-" text={line.left} />}
      {added && <InlineLine next={line.newLine} sign="+" text={line.right} />}
    </>
  );
}

function InlineLine(props: { old?: number; next?: number; sign: ' ' | '-' | '+'; text: string }) {
  const tone =
    props.sign === '-'
      ? 'bg-state-failed/10 text-state-failed'
      : props.sign === '+'
        ? 'bg-state-idle/10 text-state-idle'
        : '';
  const number = 'select-none pr-3 text-right text-muted-foreground';
  return (
    <>
      <span className={cn(number, tone)}>{props.old}</span>
      <span className={cn(number, tone)}>{props.next}</span>
      <span className={cn('select-none', tone)}>{props.sign}</span>
      <span className={cn('whitespace-pre-wrap break-all pr-3', props.sign !== ' ' && tone)}>
        {props.text}
      </span>
    </>
  );
}
