import type { Agent, ProjectRow } from '@mesa/core';
import { supportsAgentCapability } from '@mesa/core/browser';
import { FolderPlus, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The other projects a new session also works in, each in its own worktree on the session's
 * branch (mesa open --with; CONTEXT.md, Additional project): Add project lists every visible
 * project but `project` (one whose folder is gone is disabled), and each chosen one is a chip
 * to remove. Nothing for an agent that cannot add a folder.
 */
export function AdditionalProjectsField(props: {
  agent: Agent;
  project?: string;
  projects?: readonly ProjectRow[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  if (!supportsAgentCapability(props.agent, 'addDir')) return null;
  const others = props.projects?.filter((p) => !p.hidden && p.name !== props.project) ?? [];
  const toggle = (name: string, on: boolean) =>
    props.onChange(on ? [...props.value, name] : props.value.filter((n) => n !== name));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="session-with-trigger"
            disabled={props.disabled || others.length === 0}
          >
            <FolderPlus aria-hidden /> Add project
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {others.map((p) => (
            <DropdownMenuCheckboxItem
              key={p.name}
              data-testid={`session-with-option-${p.name}`}
              checked={props.value.includes(p.name)}
              disabled={!p.exists}
              // Stays open, to choose another.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(on) => toggle(p.name, on === true)}
            >
              {p.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {props.value.map((name) => (
        <Badge
          key={name}
          variant="secondary"
          className="gap-1 pr-0.5"
          data-testid={`session-with-chip-${name}`}
        >
          {name}
          <IconButton
            label={`Remove ${name}`}
            icon={X}
            className="size-4"
            disabled={props.disabled}
            onClick={() => toggle(name, false)}
          />
        </Badge>
      ))}
    </div>
  );
}
