type Cell = string | number | null | undefined;

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
