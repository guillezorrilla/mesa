import type { Ticket } from '@mesa/core';
import { ChevronDown, CornerDownRight } from 'lucide-react';
import { useState } from 'react';
import { PersonAvatar } from '@/components/PersonAvatar';
import { cn } from '@/lib/utils';
import { clickupHex } from './clickup/ClickupStatus';
import { LiveDot } from './LiveDot';
import { CATEGORIES, StatusIcon } from './StatusIcon';

/** A row's assignees: up to two avatars, overlapping, or the unassigned one. */
function Assignees({ ticket }: { ticket: Ticket }) {
  const names = ticket.assignees?.map((a) => a.name) ?? [ticket.assignee];
  if (names.length < 2) return <PersonAvatar name={names[0]} />;
  return (
    <span className="inline-flex">
      {names.slice(0, 2).map((name, at) => (
        <PersonAvatar key={name} name={name} className={cn(at > 0 && '-ml-1 ring-2 ring-card')} />
      ))}
    </span>
  );
}

type Group = { id: string; status: string; category: Ticket['category']; rows: Ticket[] };

const RANK = Object.keys(CATEGORIES);

/**
 * The tickets grouped by their own status name (Ready apart from In Progress, though Jira files
 * both as in progress), by category (CATEGORIES) and then by name, the tracker's order within one.
 */
// ponytail: names order the statuses of one category; the workflow's own order needs each
// tracker's board configuration, a read (and for Jira a scope) Mesa does not have yet.
function groupByStatus(tickets: readonly Ticket[]): Group[] {
  const groups = new Map<string, Group>();
  for (const ticket of tickets) {
    const { category } = ticket;
    const status = ticket.status || CATEGORIES[category];
    const id = `${category}:${status.toLowerCase()}`;
    const group = groups.get(id) ?? { id, status, category, rows: [] };
    groups.set(id, group);
    group.rows.push(ticket);
  }
  return [...groups.values()].sort(
    (a, b) =>
      RANK.indexOf(a.category) - RANK.indexOf(b.category) ||
      a.status.localeCompare(b.status, undefined, { sensitivity: 'base' }),
  );
}

/**
 * The tickets grouped by status (groupByStatus), done groups collapsed at first. Each row is one
 * line: status, key, title (marked when a subtask), a Live dot when a session works from it, and
 * the assignee. ↑ and ↓ move the selection.
 */
export function TicketList(props: {
  tickets: readonly Ticket[];
  /** A key as the row shows it (GitHub's #12). */
  shortKey?: (key: string) => string;
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  // The groups the person opened or closed; the rest are open unless done.
  const [picked, setPicked] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isOpen = (group: Group) => picked.get(group.id) ?? group.category !== 'done';
  const toggle = (group: Group) => setPicked(new Map(picked).set(group.id, !isOpen(group)));
  const groups = groupByStatus(props.tickets);
  const move = (step: number) => {
    const order = groups.flatMap((group) => (isOpen(group) ? group.rows : [])).map((t) => t.key);
    const at = props.selected ? order.indexOf(props.selected) : -1;
    const next = order[Math.min(order.length - 1, Math.max(0, at + step))];
    if (next) {
      props.onSelect(next);
      document.querySelector<HTMLElement>(`[data-ticket="${next}"]`)?.focus();
    }
  };
  return (
    <div
      role="listbox"
      aria-label="Tickets"
      tabIndex={-1}
      className="py-1.5"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        move(event.key === 'ArrowDown' ? 1 : -1);
      }}
    >
      {groups.map((group) => {
        const open = isOpen(group);
        return (
          <div key={group.id}>
            <button
              type="button"
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-4 pt-2.5 pb-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggle(group)}
            >
              <ChevronDown
                aria-hidden
                className={cn('size-3 transition-transform', !open && '-rotate-90')}
              />
              <span className="inline-block first-letter:uppercase">{group.status}</span>
              <span className="text-muted-foreground/70 tabular-nums">{group.rows.length}</span>
            </button>
            {open &&
              group.rows.map((ticket) => (
                <button
                  key={`${ticket.site}:${ticket.key}`}
                  type="button"
                  role="option"
                  data-ticket={ticket.key}
                  data-testid="ticket-row"
                  aria-selected={ticket.key === props.selected}
                  className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none aria-selected:bg-accent"
                  onClick={() => props.onSelect(ticket.key)}
                >
                  <StatusIcon category={ticket.category} color={clickupHex(ticket.color)} />
                  <span className="w-[4.5rem] truncate font-mono text-xs text-muted-foreground">
                    {props.shortKey?.(ticket.key) ?? ticket.key}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {ticket.parent && (
                      <CornerDownRight
                        role="img"
                        aria-label="Subtask"
                        className="size-3 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="truncate">{ticket.summary}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {ticket.sessions.length > 0 && <LiveDot />}
                    <Assignees ticket={ticket} />
                  </span>
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
