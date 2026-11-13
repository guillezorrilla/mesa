import { type CallResult, type DiffLine, diffLines } from '@mesa/core/phone';
import { useRef, useState } from 'react';
import type { MacLink } from '../mac/macLink';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { shownRows } from './shownRows';

/** A file's diff as read so far: its rows, the next patch line to ask for, and how many there are. */
export type DiffRead = { rows: DiffLine[]; next: number; total: number; error?: string };

/** Asks the Mac for the page of a file's patch lines starting at `from` (a `diff` or `prDiff` call). */
export type PageReader = (link: MacLink, from: number) => Promise<CallResult<'diff'>>;

/** Reads the page at `from` and adds its rows to `rows`; a failed read stops the paging. */
async function readPage(
  link: MacLink,
  page: PageReader,
  from: number,
  rows: DiffLine[],
): Promise<DiffRead> {
  const read = await tryCall(link, () => page(link, from));
  if (!read.result) return { rows, next: from, total: from, error: read.error };
  const { lines, at, total } = read.result;
  return {
    rows: [...rows, ...shownRows(diffLines(lines, at).rows)],
    next: from + lines.length,
    total,
  };
}

/** One file's diff, read a page at a time through `page`: the first as a promise to `use()`. */
export function useDiffPages(page: PageReader) {
  const link = useMac();
  const [first] = useState(() => readPage(link, page, 0, []));
  const [more, setMore] = useState<DiffRead>();
  const reading = useRef(false);
  const readMore = async (shown: DiffRead) => {
    if (reading.current || shown.next >= shown.total) return;
    reading.current = true;
    setMore(await readPage(link, page, shown.next, shown.rows));
    reading.current = false;
  };
  return { first, more, readMore };
}
