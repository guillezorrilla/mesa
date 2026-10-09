import type { FollowedView, TicketDefaults } from '@mesa/core';
import { Check, ChevronDown, Plus, RefreshCw, Search, Settings2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TicketSettingsPanel } from './TicketSettingsPanel';

/** A view's second line: its sprints this read, else what it reads. */
const subtitle = (view: FollowedView) => view.sprints?.join(', ') ?? view.describe;

/**
 * The Tickets tab's one bar: the view switcher (with Follow and Manage), search, when the list
 * was read, Refresh, and the gear with this project's ticket settings.
 */
export function TicketsToolbar(props: {
  project: string;
  views: FollowedView[];
  view: string | undefined;
  counts: Record<string, number>;
  onView: (name: string | undefined) => void;
  onFollow: () => void;
  onManage: () => void;
  query: string;
  onQuery: (query: string) => void;
  updated: string;
  busy: boolean;
  onRefresh: () => void;
  settings: {
    projectPrompt: string | null;
    prompt: string | null;
    defaults: TicketDefaults;
  };
  onSettingsChanged: () => void;
}) {
  const current = props.views.find((v) => v.name === props.view);
  const choices: [string | undefined, string, string][] = [
    ...(props.views.length > 1
      ? [[undefined, 'All views', `${props.views.length} views`] as [undefined, string, string]]
      : []),
    ...props.views.map((v): [string, string, string] => [v.name, v.name, subtitle(v)]),
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="max-w-full gap-2"
            data-testid="view-switcher"
          >
            <span className="font-medium">{current?.name ?? 'All views'}</span>
            <span className="truncate text-muted-foreground">
              {current ? subtitle(current) : `${props.views.length} views`}
            </span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-64">
          {choices.map(([name, label, sub]) => (
            <DropdownMenuItem
              key={name ?? '*'}
              role="menuitemradio"
              aria-checked={props.view === name}
              onSelect={() => props.onView(name)}
              className="items-start"
            >
              <Check aria-hidden className={props.view === name ? 'mt-0.5' : 'invisible mt-0.5'} />
              <span className="grid flex-1">
                {label}
                <span className="text-xs text-muted-foreground">{sub}</span>
              </span>
              {name !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {props.counts[name] ?? 0}
                </span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={props.onFollow}>
            <Plus aria-hidden /> Follow a view
          </DropdownMenuItem>
          {props.views.length > 0 && (
            <DropdownMenuItem onSelect={props.onManage}>Manage views</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <label
        htmlFor="ticket-search"
        className="flex min-w-40 max-w-80 flex-1 items-center gap-2 rounded-md border bg-background px-2.5"
      >
        <Search aria-hidden className="size-4 text-muted-foreground" />
        <input
          id="ticket-search"
          type="search"
          placeholder="Search tickets"
          value={props.query}
          onChange={(event) => props.onQuery(event.currentTarget.value)}
          className="w-full bg-transparent py-1.5 text-sm outline-none"
        />
      </label>
      <span className="ml-auto hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
        {props.updated}
      </span>
      <IconButton
        label="Refresh tickets"
        icon={RefreshCw}
        disabled={props.busy}
        onClick={props.onRefresh}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ticket settings"
            title="Ticket settings"
          >
            <Settings2 aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <TicketSettingsPanel
            project={props.project}
            {...props.settings}
            onChanged={props.onSettingsChanged}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
