import type { SessionRecord, Task } from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Task commands (CONTEXT.md, Task): a coordinator's tasks, and starting a ready one. */
export const tasksCommands = {
  'tasks.list': commandWith<{ coordinator: string }, { tasks: Task[] }>(({ coordinator }) => [
    'tasks',
    '--coordinator',
    coordinator,
  ]),
  // The same start as `mesa worker <project> --task <id>`, the coordinator as its parent.
  'tasks.start': commandWith<
    { id: string; project: string; parent: string },
    Recorded<{ task: Task; worker: SessionRecord }>
  >(({ id, project, parent }) => ['worker', '--task', id, '--parent', parent, '--', project]),
};
