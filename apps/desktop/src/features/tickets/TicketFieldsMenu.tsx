import type { JiraField } from '@mesa/core';
import { Check, Plus, SlidersHorizontal } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SourceError } from '@/features/projects/import/SourceError';
import { substringFilter } from '@/lib/substringFilter';
import { useCommand } from '@/lib/useCommand';

/**
 * Customize fields under a ticket's own: the Jira fields every ticket panel shows, for all
 * projects. Shown ones come first with a check; picking one shows or hides it, and the search
 * finds any of the site's fields by name or id.
 */
export function TicketFieldsMenu(props: {
  shown: JiraField[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const ids = props.shown.map((f) => f.id);
  const toggle = (id: string) =>
    props.onChange(ids.includes(id) ? ids.filter((shown) => shown !== id) : [...ids, id]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 justify-self-start text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal aria-hidden /> Customize fields
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" data-testid="ticket-fields-menu">
        <div className="grid gap-0.5 border-b px-3 py-2.5">
          <span className="text-sm font-medium">Fields in every ticket</span>
          <span className="text-xs text-muted-foreground">
            Shown after each ticket's own fields, in all your projects.
          </span>
        </div>
        <Command filter={substringFilter}>
          <CommandInput placeholder="Search Jira fields" />
          <CommandList className="max-h-72">
            {props.shown.length > 0 && (
              <CommandGroup heading="Shown">
                {props.shown.map((field) => (
                  <FieldItem
                    key={field.id}
                    field={field}
                    shown
                    disabled={props.disabled}
                    onSelect={() => toggle(field.id)}
                  />
                ))}
              </CommandGroup>
            )}
            <SiteFields shown={ids} disabled={props.disabled} onSelect={toggle} />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** The site's fields not shown yet, read when the menu opens. */
function SiteFields(props: { shown: string[]; disabled: boolean; onSelect: (id: string) => void }) {
  const read = useCommand('tickets.fields');
  if (read.error && !read.data)
    return (
      <div className="p-2">
        <SourceError source="atlassian" error={read.error} onRetry={read.refresh} />
      </div>
    );
  if (!read.data) return <Muted className="px-3 py-2.5">Reading your Jira fields...</Muted>;
  const all = read.data.fields;
  // Jira lets two fields share a name: those show their id to tell them apart. The list comes
  // sorted by name, so a shared name sits next to its twin.
  const sharedNames = new Set(all.filter((f, i) => all[i - 1]?.name === f.name).map((f) => f.name));
  return (
    <>
      <CommandEmpty>No Jira field matches.</CommandEmpty>
      <CommandGroup heading="Add a field">
        {all
          .filter((f) => !props.shown.includes(f.id))
          .map((field) => (
            <FieldItem
              key={field.id}
              field={field}
              hint={sharedNames.has(field.name) ? field.id : undefined}
              disabled={props.disabled}
              onSelect={() => props.onSelect(field.id)}
            />
          ))}
      </CommandGroup>
    </>
  );
}

function FieldItem(props: {
  field: JiraField;
  shown?: boolean;
  hint?: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  const Icon = props.shown ? Check : Plus;
  return (
    <CommandItem
      value={`${props.field.name} ${props.field.id}`}
      disabled={props.disabled}
      aria-checked={Boolean(props.shown)}
      onSelect={props.onSelect}
    >
      <Icon aria-hidden className={props.shown ? 'text-primary' : undefined} />
      <span className="truncate">{props.field.name}</span>
      {props.hint && (
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{props.hint}</span>
      )}
    </CommandItem>
  );
}
