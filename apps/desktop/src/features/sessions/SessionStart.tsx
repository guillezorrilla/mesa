import type { ProjectRow } from '@mesa/core';
import { FolderPlus, Send } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { ProjectSelect } from './fields/ProjectSelect';

/** A session the Sessions screen opens itself: the empty state's first message, or a child. */
export type NewSessionInput = {
  project?: string;
  general?: boolean;
  goal?: string;
  worktree?: boolean;
  terminal?: boolean;
  parent?: string;
};

export function SessionStart(props: {
  projects?: readonly ProjectRow[];
  projectsError?: string;
  onRetryProjects?: () => void;
  disabled: boolean;
  onOpen: (input: NewSessionInput) => void;
  onAddProject?: (request: ProjectAddRequest) => void;
}) {
  const [goal, setGoal] = useState('');
  const [chosen, setChosen] = useState('');
  const projects = props.projects?.filter((project) => !project.hidden);
  const project = chosen
    ? projects?.find((project) => project.name === chosen)
    : projects?.find((project) => project.exists);
  return (
    <div data-testid="session-start" className="flex min-h-0 flex-1 items-center justify-center">
      {!projects && props.projectsError ? (
        <div className="space-y-3 text-center">
          <Muted role="alert">{props.projectsError}</Muted>
          <Button variant="outline" onClick={props.onRetryProjects}>
            Retry projects
          </Button>
        </div>
      ) : !projects ? (
        <Muted>Loading projects...</Muted>
      ) : projects.length === 0 ? (
        <Button
          data-testid="empty-add-project"
          onClick={(event) =>
            props.onAddProject?.({ kind: 'local', returnFocus: event.currentTarget })
          }
        >
          <FolderPlus aria-hidden /> Add project
        </Button>
      ) : (
        <form
          className="w-full max-w-3xl space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!props.disabled && goal.trim() && project?.exists)
              props.onOpen({ project: project.name, goal });
          }}
        >
          <Label htmlFor="session-start-goal" className="sr-only">
            First message
          </Label>
          <div className="flex items-end gap-2 rounded-xl border bg-card/45 p-4 focus-within:border-ring">
            <Textarea
              id="session-start-goal"
              data-testid="session-start-goal"
              placeholder="What's the mission? Describe your goal or paste a ticket URL..."
              rows={3}
              value={goal}
              disabled={props.disabled}
              onChange={(event) => setGoal(event.target.value)}
              className="min-h-20 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Start session"
              data-testid="session-start-submit"
              disabled={props.disabled || !goal.trim() || !project?.exists}
            >
              <Send aria-hidden />
            </Button>
          </div>
          <div className="mx-auto w-fit max-w-full">
            <Label htmlFor="session-start-project" className="sr-only">
              Project
            </Label>
            <ProjectSelect
              id="session-start-project"
              projects={projects}
              value={project?.name ?? ''}
              disabled={props.disabled}
              onChange={(event) => setChosen(event.target.value)}
            />
          </div>
        </form>
      )}
    </div>
  );
}
