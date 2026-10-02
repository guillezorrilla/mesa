import type { ImportListRow, ImportResult, ItemSource } from '@mesa/core';
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
  // The goal a session started from the item gets, for the composer to fill in.
  'imports.goal': commandWith<
    { project: string; from: string },
    { source: ItemSource; id: string; title: string; goal: string }
  >(({ project, from }) => ['import', 'goal', '--project', project, '--', from]),
  // Waits for the Write notes run, which can take minutes.
  'imports.add': commandWith<
    { project: string; links: string[]; notes: boolean },
    Recorded<ImportResult>
  >(({ project, links, notes }) => [
    'import',
    '--project',
    project,
    ...notesFlag(notes),
    '--',
    ...links,
  ]),
  'imports.refresh': commandWith<
    { project: string; id?: string; notes: boolean; changedOnly?: boolean },
    Recorded<ImportResult>
  >(({ project, id, notes, changedOnly }) => [
    'import',
    'refresh',
    '--project',
    project,
    ...notesFlag(notes),
    ...(changedOnly ? ['--changed-only'] : []),
    '--',
    ...(id ? [id] : []),
  ]),
};
