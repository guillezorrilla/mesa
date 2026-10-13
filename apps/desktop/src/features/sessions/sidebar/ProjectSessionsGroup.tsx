import type { ProjectRow } from '@mesa/core';
import { ChevronDown, ChevronRight, Folder, FolderOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { hueOf } from '@/lib/hueOf';
import { cn } from '@/lib/utils';
import { ProjectNewSessionMenu } from '../start/ProjectNewSessionMenu';
import { StartingSessions } from '../start/StartingSessions';
import type { SessionLocation } from '../start/useStartSession';

/**
 * One project in the Sessions tab: a header that folds its session cards, and its + menu. A
 * project with sessions reads bright with its count, its cards hung from a rail in the project's
 * own color (the folder wears it too); an empty one stays quiet.
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
  const FolderIcon = closed || !count ? Folder : FolderOpen;
  const color = `oklch(0.7 0.13 ${hueOf(project.name)})`;
  return (
    <div className="mb-2">
      <div
        className={cn(
          'flex items-center gap-1 px-1 text-muted-foreground',
          count ? 'text-[13px]' : 'text-xs',
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
            <ChevronRight aria-hidden className="size-3" />
          ) : (
            <ChevronDown aria-hidden className="size-3" />
          )}
          <FolderIcon
            aria-hidden
            className="size-3.5 shrink-0"
            style={count ? { color } : undefined}
          />
          <span
            className={cn('truncate', count > 0 && 'font-semibold tracking-tight text-foreground')}
          >
            {project.label}
          </span>
        </button>
        {count > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[10px] leading-4 font-medium tabular-nums">
            {count}
          </span>
        )}
        <ProjectNewSessionMenu project={project} onNewSession={props.onNewSession} />
      </div>
      {!closed && count > 0 && (
        <div
          className="mt-1 ml-3 space-y-1 border-l-2 pl-2"
          style={{ borderColor: `color-mix(in oklch, ${color} 45%, transparent)` }}
        >
          {props.children}
        </div>
      )}
      <StartingSessions project={project.name} starting={props.starting} />
    </div>
  );
}
