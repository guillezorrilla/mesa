import { createHash } from 'node:crypto';
import { DIFF_START, type DiffAt, diffLines } from '../protocol/diff-lines.js';

/** One file's part of a patch: its lines from its `diff --git` header on. */
export type PatchFile = {
  path: string;
  lines: string[];
  added: number;
  removed: number;
  rev: string;
};

/** Git quotes a path that is not plain ASCII: "b/caf\303\251.txt". ponytail: shown quoted. */
const unquote = (path: string) => path.replace(/^"(.*)"$/, '$1');

/** The file a part names: its new path, its old one when deleted, else its header's. */
function pathOf(lines: readonly string[]): string {
  const hunk = lines.findIndex((line) => line.startsWith('@@'));
  const header = hunk < 0 ? lines : lines.slice(0, hunk);
  const side = (sign: string) =>
    header.find((line) => line.startsWith(sign) && !line.endsWith('/dev/null'))?.slice(6);
  const named = side('+++ ') ?? side('--- ');
  if (named) return unquote(named);
  const git = /^diff --git "?a\/.*"? "?b\/(.*?)"?$/.exec(lines[0] ?? '');
  return git?.[1] ?? lines[0] ?? '';
}

/** A patch cut at each `diff --git` header, one entry per file, with its + and - counts. */
export function patchFiles(patch: string): PatchFile[] {
  if (!patch) return [];
  return patch
    .replace(/\n$/, '')
    .split(/\n(?=diff --git )/)
    .map((part) => {
      const lines = part.split('\n');
      const { rows } = diffLines(lines, DIFF_START);
      return {
        path: pathOf(lines),
        lines,
        added: rows.filter((row) => row.kind === 'add').length,
        removed: rows.filter((row) => row.kind === 'del').length,
        rev: createHash('sha256').update(part).digest('hex').slice(0, 16),
      };
    });
}

/** At most this many lines, or about this many bytes, per page: well under a call's 600 KB. */
const PAGE_LINES = 400;
const PAGE_BYTES = 48 * 1024;
/** ponytail: a longer line (minified code) is cut here for the phone; send it whole if one is ever needed. */
const LINE_CHARS = 2000;

/**
 * The page of `lines` starting at `from`: at least one line, then lines until PAGE_LINES or
 * PAGE_BYTES (a long line cut), with the line numbers where it starts, so the phone numbers it alone.
 */
export function patchPage(lines: readonly string[], from: number) {
  const at: DiffAt = diffLines(lines.slice(0, from), DIFF_START).next;
  const page: string[] = [];
  let bytes = 0;
  for (const whole of lines.slice(from, from + PAGE_LINES)) {
    const line = whole.length > LINE_CHARS ? `${whole.slice(0, LINE_CHARS)} ...` : whole;
    bytes += Buffer.byteLength(line) + 1;
    if (page.length && bytes > PAGE_BYTES) break;
    page.push(line);
  }
  return { lines: page, from, at, total: lines.length };
}
