import type { SlashCommand } from '@mesa/core';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { invocation, type SlashGroup } from './slashMatches';

/**
 * The slash menu above the composer. The textarea keeps focus, so the caller moves `active` with
 * the arrow keys (useSlashMenu); cmdk only draws the list, its own filtering off.
 */
export function SlashMenu(props: {
  groups: SlashGroup[];
  active: SlashCommand | undefined;
  onPick: (command: SlashCommand) => void;
}) {
  return (
    <Command
      shouldFilter={false}
      value={props.active ? `${props.active.source}:${props.active.name}` : ''}
      className="max-h-64 rounded-md border shadow-md"
      aria-label="Slash commands"
    >
      <CommandList>
        {props.groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((c) => (
              <CommandItem
                key={`${c.source}:${c.name}`}
                value={`${c.source}:${c.name}`}
                // Keep the textarea focused through the click.
                onMouseDown={(e) => e.preventDefault()}
                onSelect={() => props.onPick(c)}
              >
                <span className="font-mono">{invocation(c.name)}</span>
                {c.argumentHint && (
                  <span className="text-muted-foreground/70">{c.argumentHint}</span>
                )}
                <span className="ml-auto truncate text-muted-foreground">{c.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
