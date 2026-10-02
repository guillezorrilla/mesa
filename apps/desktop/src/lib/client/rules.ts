import type { FileChange, RuleRow, WorkspaceFile } from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Rule commands: the instruction files agents read. */
export const rulesCommands = {
  'rules.list': commandWith<{ project?: string }, RuleRow[]>(({ project }) => [
    'rules',
    'list',
    ...(project ? ['--project', project] : []),
  ]),
  'rules.read': commandWith<{ id: string; project?: string }, WorkspaceFile>(({ id, project }) => [
    'rules',
    'read',
    ...(project ? ['--project', project] : []),
    '--',
    id,
  ]),
  'rules.write': commandWith<
    { id: string; project?: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ id, project, text, revision }) => [
    'rules',
    'write',
    ...(project ? ['--project', project] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    id,
  ]),
};
