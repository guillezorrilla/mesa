import { type DiffLine, diffLines } from '@mesa/core/phone';
import { useRef, useState } from 'react';
import type { MacLink } from '../mac/macLink';
import { SLOW_MS } from '../mac/slowCall';
import { tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { shownRows } from './shownRows';

/** A file's diff as read so far: its rows, the next patch line to ask for, and how many there are. */
export type DiffRead = { rows: DiffLine[]; next: number; total: number; error?: string };

type Page = { id: string; path: string; rev: string; from: number };

/** Reads the page at `from` and adds its rows to `rows`; a failed read stops the paging. */
async function readPage(link: MacLink, page: Page, rows: DiffLine[]): Promise<DiffRead> {
  const read = await tryCall(link, () => link.call({ method: 'diff', ...page }, SLOW_MS));
  if (!read.result) return { rows, next: page.from, total: page.from, error: read.error };
  const { lines, at, total } = read.result;
  return {
    rows: [...rows, ...shownRows(diffLines(lines, at).rows)],
    next: page.from + lines.length,
    total,
  };
}

/** One file's diff at revision `rev`, read a page at a time: the first as a promise to `use()`. */
export function useDiffPages(id: string, path: string, rev: string) {
  const link = useMac();
  const [first] = useState(() => readPage(link, { id, path, rev, from: 0 }, []));
  const [more, setMore] = useState<DiffRead>();
  const reading = useRef(false);
  const readMore = async (shown: DiffRead) => {
    if (reading.current || shown.next >= shown.total) return;
    reading.current = true;
    setMore(await readPage(link, { id, path, rev, from: shown.next }, shown.rows));
    reading.current = false;
  };
  return { first, more, readMore };
}
