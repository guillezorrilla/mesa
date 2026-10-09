import type { Ticket } from '@mesa/core';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AssigneeAvatar } from './AssigneeAvatar';
import { LiveDot } from './LiveDot';
import { CATEGORIES, StatusIcon } from './StatusIcon';

/** `tickets` in the list's order: by status group (CATEGORIES), Jira's order within one. */
function inListOrder(tickets: readonly Ticket[], collapsed: ReadonlySet<string>) {
  return CATEGORIES.flatMap(([category]) =>
    collapsed.has(category) ? [] : tickets.filter((t) => groupOf(t) === category),
  );
}

/** A ticket's group: its status category, an unknown one counting as to do. */
const groupOf = (ticket: Ticket) =>
  CATEGORIES.some(([c]) => c === ticket.category) ? ticket.category : 'new';

/**
 * The tickets grouped by status, done collapsed at first. Each row is one line: status, key,
 * title, a Live dot when a session works from it, and the assignee. ↑ and ↓ move the selection.
 */
export function TicketList(props: {
  tickets: readonly Ticket[];
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set(['done']));
  const toggle = (category: string) =>
    setCollapsed((was) => {
      const next = new Set(was);
      if (!next.delete(category)) next.add(category);
      return next;
    });
  const move = (step: number) => {
    const order = inListOrder(props.tickets, collapsed).map((t) => t.key);
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
      {CATEGORIES.map(([category, label]) => {
        const rows = props.tickets.filter((t) => groupOf(t) === category);
        if (!rows.length) return null;
        const open = !collapsed.has(category);
        return (
          <div key={category}>
            <button
              type="button"
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-4 pt-2.5 pb-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => toggle(category)}
            >
              <ChevronDown
                aria-hidden
                className={cn('size-3 transition-transform', !open && '-rotate-90')}
              />
              {label}
              <span className="text-muted-foreground/70 tabular-nums">{rows.length}</span>
            </button>
            {open &&
              rows.map((ticket) => (
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
                  <StatusIcon category={ticket.category} />
                  <span className="w-[4.5rem] truncate font-mono text-xs text-muted-foreground">
                    {ticket.key}
                  </span>
                  <span className="truncate">{ticket.summary}</span>
                  <span className="flex items-center gap-2">
                    {ticket.sessions.length > 0 && <LiveDot />}
                    <AssigneeAvatar name={ticket.assignee} />
                  </span>
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}
