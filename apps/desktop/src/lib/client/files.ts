import type {
  Checkout,
  FileChange,
  FileLink,
  FileSearch,
  FileTree,
  WorkspaceFile,
} from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Files commands over a project's checkout. */
export const filesCommands = {
  'files.tree': commandWith<{ project: string; checkout?: string }, FileTree>(
    ({ project, checkout }) => [
      'files',
      'tree',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'files.search': commandWith<
    { project: string; checkout?: string; query: string; content?: boolean },
    FileSearch
  >(({ project, checkout, query, content }) => [
    'files',
    'search',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(content ? ['--content'] : []),
    '--',
    project,
    query,
  ]),
  'files.read': commandWith<
    { project: string; checkout?: string; path: string; line?: number },
    WorkspaceFile & { targetLine?: number }
  >(({ project, checkout, path, line }) => [
    'files',
    'read',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(line ? ['--line', String(line)] : []),
    '--',
    project,
    path,
  ]),
  'files.open': commandWith<
    { project: string; checkout?: string; path: string; line?: number },
    Recorded<{ checkout: Checkout; path: string; line: number; opened: boolean }>
  >(({ project, checkout, path, line }) => [
    'files',
    'open',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(line ? ['--line', String(line)] : []),
    '--',
    project,
    path,
  ]),
  'files.link': commandWith<{ session: string; target: string }, FileLink>(
    ({ session, target }) => ['files', 'link', '--', session, target],
  ),
  'files.write': commandWith<
    { project: string; checkout?: string; path: string; text: string; revision: string },
    Recorded<FileChange>
  >(({ project, checkout, path, text, revision }) => [
    'files',
    'write',
    ...(checkout ? ['--checkout', checkout] : []),
    `--text=${text}`,
    '--revision',
    revision,
    '--',
    project,
    path,
  ]),
  'files.create': commandWith<
    { project: string; checkout?: string; path: string; text?: string },
    Recorded<FileChange>
  >(({ project, checkout, path, text }) => [
    'files',
    'create',
    ...(checkout ? ['--checkout', checkout] : []),
    `--text=${text ?? ''}`,
    '--',
    project,
    path,
  ]),
  'files.rename': commandWith<
    { project: string; checkout?: string; from: string; path: string; revision: string },
    Recorded<FileChange>
  >(({ project, checkout, from, path, revision }) => [
    'files',
    'rename',
    ...(checkout ? ['--checkout', checkout] : []),
    '--revision',
    revision,
    '--',
    project,
    from,
    path,
  ]),
  'files.delete': commandWith<
    { project: string; checkout?: string; path: string; revision: string },
    Recorded<FileChange>
  >(({ project, checkout, path, revision }) => [
    'files',
    'delete',
    ...(checkout ? ['--checkout', checkout] : []),
    '--revision',
    revision,
    '--',
    project,
    path,
  ]),
};
