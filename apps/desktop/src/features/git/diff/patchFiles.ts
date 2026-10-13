import type { DiffRow } from '@mesa/core';

export type PatchFile = { path: string; rows: DiffRow[] };

/** A whole-commit patch cut at each `diff --git` header, one entry per file. */
export function patchFiles(rows: DiffRow[]): PatchFile[] {
  const files: PatchFile[] = [];
  for (const row of rows) {
    // Git quotes a header whose path is not plain ASCII: diff --git "a/x" "b/x".
    const header = row.kind === 'meta' && /^diff --git "?a\/.*"? "?b\/(.*?)"?$/.exec(row.left);
    if (header) files.push({ path: header[1] ?? row.left, rows: [] });
    else files.at(-1)?.rows.push(row);
  }
  return files;
}
