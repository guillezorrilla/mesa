import type { ImportListRow, ImportProgress, ImportResult, ItemSource } from '@mesa/core';
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
  // The project's running import, null when none runs: the Context tab polls it while one does.
  'imports.status': commandWith<
    { project: string },
    { project: string; progress: ImportProgress | null }
  >(({ project }) => ['import', 'status', '--project', project]),
  // The goal a session started from the item gets, for the composer to fill in.
  // `prompt`: a Saved prompt's name for a Jira issue's goal, null for none, else the project's.
  'imports.goal': commandWith<
    { project: string; from: string; prompt?: string | null },
    { source: ItemSource; id: string; title: string; goal: string }
  >(({ project, from, prompt }) => [
    'import',
    'goal',
    '--project',
    project,
    ...(prompt === null ? ['--no-prompt'] : prompt ? [`--prompt=${prompt}`] : []),
    '--',
    from,
  ]),
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
