import type { FileChange, SkillInventoryRow, SkillSync, WorkspaceFile } from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Skill commands: the inventory, a skill's files, and which a project runs. */
export const skillsCommands = {
  'skills.list': commandWith<{ project?: string }, SkillInventoryRow[]>(({ project }) => [
    'skills',
    'list',
    ...(project ? ['--', project] : []),
  ]),
  'skills.read': commandWith<{ id: string; project?: string; file?: string }, WorkspaceFile>(
    ({ id, project, file }) => [
      'skills',
      'read',
      ...(project ? ['--project', project] : []),
      ...(file ? ['--file', file] : []),
      '--',
      id,
    ],
  ),
  'skills.write': commandWith<
    { id: string; project?: string; file?: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ id, project, file, text, revision }) => [
    'skills',
    'write',
    ...(project ? ['--project', project] : []),
    ...(file ? ['--file', file] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    id,
  ]),
  // A skill run (CONTEXT.md, Skill run), which resolves when the run ends: minutes. The skill's
  // words go after `--` as one, so words starting with `-` are its own. `--yes` answers a
  // guardrail's ask; the app never passes `--force`, so a block is final here.
  'skills.sync': commandWith<{ project: string }, Recorded<SkillSync>>(({ project }) => [
    'skills',
    'sync',
    '--',
    project,
  ]),
  'skills.set': commandWith<
    { project: string; name: string; enabled: boolean },
    Recorded<{
      project: string;
      name: string;
      enabled: boolean;
      skills: string[];
      changed: boolean;
    }>
  >(({ project, name, enabled }) => [
    'skills',
    'set',
    '--enabled',
    String(enabled),
    '--',
    project,
    name,
  ]),
};
