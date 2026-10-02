import type { ProjectRow, ProjectSort, TreeRow } from '@mesa/core';
import { ChevronRight, Folder, FolderPlus } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { AddProjectMenu, type ProjectAddRequest } from '@/features/projects/AddProjectMenu';
import { cn } from '@/lib/utils';
import type { WorkspaceView } from '../navigation';
import { ProjectSortMenu } from './ProjectSortMenu';

/** The Projects tab: Add project, the sort, and each visible project with its active session count. */
export function ProjectsSection(props: {
  projects: readonly ProjectRow[];
  /** The active sessions, counted per project. */
  active: readonly TreeRow[];
  view: WorkspaceView;
  onView: (view: WorkspaceView) => void;
  sort: ProjectSort;
  onSort: (sort: ProjectSort) => void;
  onAddProject: (request: ProjectAddRequest) => void;
}) {
  const { view, onView } = props;
  return (
    <>
      <AddProjectMenu onSelect={props.onAddProject}>
        <Button variant="ghost" className="mb-4 w-full justify-start" aria-label="Add project">
          <FolderPlus aria-hidden className="size-4" /> Add project
          <ChevronRight aria-hidden className="ml-auto size-4" />
        </Button>
      </AddProjectMenu>
      <div className="mb-2 flex items-center justify-between px-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span>Your projects</span>
        <ProjectSortMenu sort={props.sort} onSort={props.onSort} />
      </div>
      {props.projects.length === 0 && (
        <Muted size="xs" className="px-2">
          No visible projects
        </Muted>
      )}
      {props.projects.map((project) => (
        <Button
          key={project.name}
          variant="ghost"
          size="sm"
          data-testid="sidebar-project"
          className={cn(
            'w-full justify-start truncate text-xs',
            view.kind === 'project' && view.name === project.name && 'bg-accent',
          )}
          aria-current={view.kind === 'project' && view.name === project.name ? 'page' : undefined}
          title={project.path}
          onClick={() => onView({ kind: 'project', name: project.name })}
        >
          <Folder aria-hidden className="size-4 shrink-0" />
          <span className="truncate">{project.label}</span>
          <span className="ml-auto text-muted-foreground">
            {props.active.filter((session) => session.project === project.name).length || ''}
          </span>
        </Button>
      ))}
    </>
  );
}
