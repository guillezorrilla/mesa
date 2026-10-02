import type { ImportListRow, ImportResult } from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** `--no-notes` when Write notes is off. */
const notesFlag = (notes: boolean) => (notes ? [] : ['--no-notes']);

/** Import commands: a project's Imports (CONTEXT.md, Import). */
export const importsCommands = {
  'imports.list': commandWith<{ project: string }, { items: ImportListRow[] }>(({ project }) => [
    'import',
    'list',
    '--project',
    project,
  ]),
  // Waits for the Write notes run, which can take minutes.
  'imports.add': commandWith<
    { project: string; link: string; notes: boolean },
    Recorded<ImportResult>
  >(({ project, link, notes }) => [
    'import',
    '--project',
    project,
    ...notesFlag(notes),
    '--',
    link,
  ]),
  'imports.refresh': commandWith<
    { project: string; id: string; notes: boolean },
    Recorded<ImportResult>
  >(({ project, id, notes }) => [
    'import',
    'refresh',
    '--project',
    project,
    ...notesFlag(notes),
    '--',
    id,
  ]),
};
