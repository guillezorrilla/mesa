import type { ProjectRow } from '@mesa/core';
import { Plus, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SessionLocation } from '../useStartSession';

/** A project group's + menu: a new session, terminal session, or worktree session in it. */
export function ProjectNewSessionMenu(props: {
  project: ProjectRow;
  onNewSession?: (project: string, kind: SessionLocation, parent?: string) => void;
}) {
  const { project } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6"
          aria-label={`New session in ${project.label}`}
        >
          <Plus aria-hidden className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-52">
        {(['main', 'terminal', 'worktree'] as const).map((kind) => (
          <DropdownMenuItem
            key={kind}
            className="text-xs"
            onSelect={() => props.onNewSession?.(project.name, kind)}
          >
            {kind === 'terminal' ? (
              <TerminalSquare aria-hidden className="size-3.5" />
            ) : (
              <Plus aria-hidden className="size-3.5" />
            )}
            {kind === 'main'
              ? 'New session'
              : kind === 'terminal'
                ? 'New terminal session'
                : 'New worktree session'}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
