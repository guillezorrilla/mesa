type Cell = string | number | null | undefined;

/** Seconds as `42s`, `5m03s`, or `2h07m`. */
export function duration(seconds: number): string {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const two = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h${two(m)}m`;
  return m ? `${m}m${two(s)}s` : `${s}s`;
}

/** Rows as aligned columns: every column but the last padded to its widest cell; empty cells dropped at the end. */
export function columns(rows: Cell[][], indent = ''): string[] {
  const cells = rows.map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c))));
  const widths: number[] = [];
  for (const row of cells) {
    for (const [i, c] of row.entries()) widths[i] = Math.max(widths[i] ?? 0, c.length);
  }
  return cells.map(
    (row) =>
      indent +
      row
        .map((c, i) => (i < row.length - 1 ? c.padEnd(widths[i] ?? 0) : c))
        .join('  ')
        .trimEnd(),
  );
}
