import { FieldRow } from './FieldRow';
import type { TicketFieldsProps } from './ticketFields';

/** Jira's fields after Status and Assignee: priority, labels, sprint, and the fields the profile picked. */
export function JiraTicketFields({ ticket, detail, sprints }: TicketFieldsProps<'jira'>) {
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
