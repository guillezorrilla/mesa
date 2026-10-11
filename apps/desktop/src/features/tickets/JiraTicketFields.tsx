import type { Ticket } from '@mesa/core';
import type { DataOf } from '@/lib/client';
import { FieldRow } from './FieldRow';

/** What a tracker's panel fields get: the listed ticket, its panel read once it arrives, and its views' sprints. */
export type TicketFieldsProps = {
  ticket: Ticket;
  detail: DataOf<'tickets.show'> | undefined;
  /** The sprints of the views listing it. */
  sprints: string[];
};

/** Jira's fields after Status and Assignee: priority, labels, sprint, and the fields the profile picked. */
export function JiraTicketFields({ ticket, detail, sprints }: TicketFieldsProps) {
  const priority = detail?.priority ?? ticket.priority;
  return (
    <>
      {priority && <FieldRow name="Priority">{priority}</FieldRow>}
      {detail && detail.labels.length > 0 && (
        <FieldRow name="Labels" className="flex flex-wrap gap-1.5">
          {detail.labels.map((label) => (
            <span key={label} className="rounded-md bg-muted px-2 py-0.5 text-xs">
              {label}
            </span>
          ))}
        </FieldRow>
      )}
      {sprints.length > 0 && <FieldRow name="Sprint">{sprints.join(', ')}</FieldRow>}
      {detail?.fields?.map((field) => (
        <FieldRow key={field.id} name={field.name} className="break-words">
          {field.value ?? <span className="text-muted-foreground">None</span>}
        </FieldRow>
      ))}
    </>
  );
}
