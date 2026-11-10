import type { Task, TaskState } from '@mesa/core';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { SectionLabel } from '@/components/SectionLabel';
import { Button } from '@/components/ui/button';
import { useCall, useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { useRefreshOnStamp } from './useRefreshOnStamp';

/** Each task state's colour, in the session state tokens (task states are not session states). */
const TONE: Record<TaskState, string> = {
  pending: 'text-muted-foreground',
  ready: 'text-state-idle',
  running: 'text-state-working',
  succeeded: 'text-state-done',
  failed: 'text-state-failed',
  cancelled: 'text-muted-foreground',
};

function TaskStateBadge(props: { state: TaskState }) {
  return (
    <span
      data-testid="task-state"
      className={cn('whitespace-nowrap font-mono text-xs', TONE[props.state])}
    >
      {props.state}
    </span>
  );
}

/**
 * The tasks a session coordinates, on its Crew panel (CONTEXT.md, Task): oldest first, each with
 * its spec's first line, state, deps and their states, and its worker, which selects that session.
 * A ready task has Start (`mesa worker <project> --task <id>`, this session as parent); a refused
 * start says why on its row, and a failed task its reason. A new `stamp` reads them again.
 */
export function CrewTasks(props: {
  coordinator: string;
  /** The coordinator's project, where a worker opens; none for a General session. */
  project?: string;
  stamp: string;
  /** What each session is called on the Board, by id. */
  nameOf: (id: string) => string;
  onSelect: (id: string) => void;
}) {
  const listed = useCommand('tasks.list', { coordinator: props.coordinator });
  const call = useCall();
  const [starting, setStarting] = useState<string>();
  const [refused, setRefused] = useState<Record<string, string>>({});
  useRefreshOnStamp(props.stamp, listed.refresh);
  const tasks = listed.data?.tasks;
  if (!tasks?.length) return null;
  const stateOf = new Map(tasks.map((t) => [t.id, t.state]));
  const start = async (task: Task) => {
    if (!props.project) return;
    setStarting(task.id);
    const started = await call('tasks.start', {
      id: task.id,
      project: props.project,
      parent: props.coordinator,
    });
    setStarting(undefined);
    setRefused(({ [task.id]: _gone, ...rest }) =>
      started.ok ? rest : { ...rest, [task.id]: started.error.message },
    );
    await listed.refresh();
  };
  return (
    <section aria-label="Tasks" className="border-t py-2">
      <SectionLabel className="px-3">Tasks</SectionLabel>
      <ul data-testid="crew-tasks">
        {tasks.map((task) => (
          <li
            key={task.id}
            data-testid="crew-task"
            className="mx-1.5 grid gap-1 rounded-md px-2 py-1.5 hover:bg-accent/40"
          >
            <div className="flex min-w-0 items-center gap-2">
              <TaskStateBadge state={task.state} />
              <span className="min-w-0 flex-1 truncate text-[13px]" title={task.spec}>
                {task.spec.split('\n')[0]}
              </span>
              {task.state === 'ready' && (
                <Button
                  size="xs"
                  variant="outline"
                  aria-label={`Start ${task.id}`}
                  disabled={!props.project || starting === task.id}
                  title={props.project ? undefined : 'A General session has no project to start in'}
                  onClick={() => void start(task)}
                >
                  <Play aria-hidden /> Start
                </Button>
              )}
            </div>
            {(task.deps.length > 0 || task.worker) && (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 font-mono text-[11px] text-muted-foreground">
                {task.deps.map((dep) => (
                  <span key={dep}>
                    after {dep} {stateOf.get(dep) ?? ''}
                  </span>
                ))}
                {task.worker && (
                  <button
                    type="button"
                    className="truncate text-state-working hover:underline"
                    onClick={() => task.worker && props.onSelect(task.worker)}
                  >
                    {props.nameOf(task.worker)}
                  </button>
                )}
              </div>
            )}
            {task.state === 'failed' && task.reason && (
              <Muted className="text-state-failed">{task.reason}</Muted>
            )}
            {refused[task.id] && (
              <p role="alert" className="text-xs text-state-failed">
                {refused[task.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
