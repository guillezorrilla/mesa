import { type DiffLine, diffLines } from '@mesa/core/phone';
import { useRef, useState } from 'react';
import { type LineSelection, tapLine } from '@/lib/lineSelection';
import type { MacLink } from '../mac/macLink';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { shownRows } from './shownRows';
import { DIFF_MS } from './useChanges';

/** A file's diff as read so far: its rows, the next patch line to ask for, and how many there are. */
export type DiffRead = { rows: DiffLine[]; next: number; total: number; error?: string };

/** Reads the page from `from` and adds its rows to `rows`; a failed read stops the paging. */
async function readPage(link: MacLink, id: string, path: string, from: number, rows: DiffLine[]) {
  const read = await tryCall(link, () => link.call({ method: 'diff', id, path, from }, DIFF_MS));
  if (!read.result) return { rows, next: from, total: from, error: read.error };
  const page = read.result;
  return {
    rows: [...rows, ...shownRows(diffLines(page.lines, page.at).rows)],
    next: from + page.lines.length,
    total: page.total,
  };
}

/**
 * One file's diff, read a page at a time as it scrolls (the first as a promise to `use()`), and
 * the lines tapped to note.
 */
export function useDiff(id: string, path: string) {
  const link = useMac();
  const [first] = useState(() => readPage(link, id, path, 0, []));
  const [more, setMore] = useState<DiffRead>();
  const reading = useRef(false);
  const [selection, setSelection] = useState<LineSelection>();
  const readMore = async (shown: DiffRead) => {
    if (reading.current || shown.next >= shown.total) return;
    reading.current = true;
    setMore(await readPage(link, id, path, shown.next, shown.rows));
    reading.current = false;
  };
  return {
    first,
    more,
    readMore,
    selection,
    tap: (at: number) => setSelection((last) => tapLine(last, at)),
  };
}
