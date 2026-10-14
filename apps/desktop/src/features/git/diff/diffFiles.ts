import type { DiffRow } from '@mesa/core';
import { patchFiles } from './patchFiles';

export type DiffFile = {
  path: string;
  status: 'A' | 'M' | 'D' | 'R';
  added: number;
  removed: number;
  /** Where an editor opens the file: its first changed line, or where a removal was. */
  firstLine?: number;
  rows: DiffRow[];
};

const STATUS: [RegExp, DiffFile['status']][] = [
  [/^new file mode/, 'A'],
  [/^deleted file mode/, 'D'],
  [/^rename from/, 'R'],
];

/** A whole patch's files, each with its status letter and added and removed line counts. */
export function diffFiles(rows: DiffRow[]): DiffFile[] {
  return patchFiles(rows).map(({ path, rows }) => {
    const meta = rows.filter((row) => row.kind === 'meta').map((row) => row.left);
    const changes = rows.filter((row) => row.kind === 'change');
    return {
      path,
      status: STATUS.find(([pattern]) => meta.some((line) => pattern.test(line)))?.[1] ?? 'M',
      added: changes.filter((row) => row.newLine !== undefined).length,
      removed: changes.filter((row) => row.oldLine !== undefined).length,
      firstLine: changes[0]?.newLine ?? changes[0]?.oldLine,
      rows,
    };
  });
}
