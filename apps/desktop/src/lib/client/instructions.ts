import type { FileChange, InstructionRow, WorkspaceFile } from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Instruction file commands: the files each agent reads for standing instructions. */
export const instructionsCommands = {
  'instructions.list': commandWith<{ project?: string }, InstructionRow[]>(({ project }) => [
    'instructions',
    'list',
    ...(project ? ['--project', project] : []),
  ]),
  'instructions.read': commandWith<{ id: string; project?: string }, WorkspaceFile>(
    ({ id, project }) => [
      'instructions',
      'read',
      ...(project ? ['--project', project] : []),
      '--',
      id,
    ],
  ),
  'instructions.write': commandWith<
    { id: string; project?: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ id, project, text, revision }) => [
    'instructions',
    'write',
    ...(project ? ['--project', project] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    id,
  ]),
};
