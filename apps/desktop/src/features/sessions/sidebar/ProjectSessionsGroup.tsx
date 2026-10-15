import type { ProjectRow } from '@mesa/core';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { CountPill } from '@/components/CountPill';
import { nameColor } from '@/lib/nameColor';
import { cn } from '@/lib/utils';
import { ProjectNewSessionMenu } from '../start/ProjectNewSessionMenu';
import { StartingSessions } from '../start/StartingSessions';
import type { SessionLocation } from '../start/useStartSession';

/**
 * One project in the Sessions tab: a header that folds its session cards, and its + menu. A
 * busy project (sessions open or starting) reads bright with its count, its cards hung from a
 * rail in the project's own color (the folder wears it too), and its header stays in view while
 * its cards scroll; an empty one stays quiet.
 */
export function ProjectSessionsGroup(props: {
  project: ProjectRow;
  closed: boolean;
  onToggle: () => void;
  starting?: readonly string[];
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
  /** How many session cards it has. */
  count: number;
  /** The project's session cards. */
  children: ReactNode;
}) {
  const { project, closed, count } = props;
  const startingHere = (props.starting ?? []).includes(project.name);
  const busy = count > 0 || startingHere;
  const FolderIcon = busy && !closed ? FolderOpen : Folder;
  const color = nameColor(project.name);
  return (
    <div className="mb-2" data-testid="sidebar-project-group" data-project={project.name}>
      <div
        className={cn(
          'flex items-center gap-1 px-1 text-muted-foreground',
          busy &&
            'sticky top-0 z-10 bg-[color-mix(in_oklch,var(--card)_50%,var(--background))] text-[13px]',
          !busy && 'text-xs',
        )}
      >
        <button
          type="button"
          data-testid="sidebar-project"
          aria-label={`${closed ? 'Expand' : 'Collapse'} ${project.label} sessions`}
          aria-expanded={!closed}
          title={project.label}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md p-1 text-left hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={props.onToggle}
        >
          {closed ? (
            <ChevronRight aria-hidden className="size-3 shrink-0" />
          ) : (
            <ChevronDown aria-hidden className="size-3 shrink-0" />
          )}
          <FolderIcon
            aria-hidden
            className="size-3.5 shrink-0"
            style={busy ? { color } : undefined}
          />
          <span
            className={cn(
              'line-clamp-2 break-words',
              busy && 'font-semibold tracking-tight text-foreground',
            )}
          >
            {project.label}
          </span>
        </button>
        {count > 0 && (
          <CountPill
            count={count}
            className="bg-muted text-[10px] leading-4 font-medium text-muted-foreground tabular-nums"
          />
        )}
        <ProjectNewSessionMenu project={project} onNewSession={props.onNewSession} />
      </div>
      {((count > 0 && !closed) || startingHere) && (
        <div
          className="mt-1 ml-3 space-y-1 border-l-2 pl-2"
          style={{ borderColor: `color-mix(in oklch, ${color} 45%, transparent)` }}
        >
          {!closed && props.children}
          <StartingSessions project={project.name} starting={props.starting} />
        </div>
      )}
    </div>
  );
}
