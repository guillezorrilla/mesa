import type { ProjectRow } from '@mesa/core';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SessionLocation } from '../hooks/useStartSession';
import { ProjectNewSessionMenu } from './ProjectNewSessionMenu';
import { StartingSessions } from './StartingSessions';

/** One project in the Sessions tab: a header that folds its session cards, and its + menu. */
export function ProjectSessionsGroup(props: {
  project: ProjectRow;
  closed: boolean;
  onToggle: () => void;
  starting?: readonly string[];
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  /** The project's session cards. */
  children: ReactNode;
}) {
  const { project, closed } = props;
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <button
          type="button"
          data-testid="sidebar-project"
          aria-label={`${closed ? 'Expand' : 'Collapse'} ${project.label} sessions`}
          aria-expanded={!closed}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          onClick={props.onToggle}
        >
          {closed ? (
            <ChevronRight aria-hidden className="size-3" />
          ) : (
            <ChevronDown aria-hidden className="size-3" />
          )}
          <Folder aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">{project.label}</span>
        </button>
        <ProjectNewSessionMenu project={project} onNewSession={props.onNewSession} />
      </div>
      {!closed && <div className="mt-1 space-y-1 px-1">{props.children}</div>}
      <StartingSessions project={project.name} starting={props.starting} />
    </div>
  );
}
