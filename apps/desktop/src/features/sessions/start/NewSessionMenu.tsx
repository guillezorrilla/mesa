import type { ProjectRow } from '@mesa/core';
import { Plus, TerminalSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SessionPreset } from './useStartSession';

/**
 * The title bar's + menu: a session in any project that exists, a terminal in the project in view
 * (else the first that exists), or a General session.
 */
export function NewSessionMenu(props: {
  projects: readonly ProjectRow[] | undefined;
  /** The project in view, when it is listed. */
  current?: string;
  canStart: boolean;
  onStart: (preset: SessionPreset) => void;
}) {
  const { projects, onStart } = props;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon-sm" aria-label="New session">
          <Plus aria-hidden className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
        {projects
          ?.filter((entry) => entry.exists)
          .map((entry) => (
            <DropdownMenuItem key={entry.name} onSelect={() => onStart({ project: entry.name })}>
              {entry.label}
            </DropdownMenuItem>
          ))}
        {props.canStart && (
          <DropdownMenuItem
            onSelect={() =>
              onStart({
                project: props.current ?? projects?.find((entry) => entry.exists)?.name,
                location: 'terminal',
              })
            }
          >
            <TerminalSquare aria-hidden className="size-4" /> Open terminal
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex-col items-start gap-0"
          onSelect={() => onStart({ general: true })}
        >
          General Session <span className="text-xs text-muted-foreground">No project context</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
