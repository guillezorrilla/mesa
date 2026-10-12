import { Flag } from 'lucide-react';
import { Fragment } from 'react';
import { FieldRow } from '../FieldRow';
import type { TicketFieldsProps } from '../ticketFields';
import { clickupHex } from './ClickupStatus';

const none = <span className="text-muted-foreground">None</span>;

/** ClickUp's fields after Status and Assignees: priority with its flag, tags, due date, and the List it is in. */
export function ClickupTicketFields({ ticket, detail }: TicketFieldsProps<'clickup'>) {
  const priority = detail?.priority ?? ticket.priority;
  return (
    <>
      <FieldRow name="Priority" className="flex items-center gap-1.5">
        {priority ? (
          <>
            <Flag
              aria-hidden
              className="size-3.5 text-muted-foreground"
              style={{ color: clickupHex(detail?.priorityColor) }}
            />
            {priority}
          </>
        ) : (
          none
        )}
      </FieldRow>
      {detail && (
        <>
          <FieldRow name="Tags" className="flex flex-wrap gap-1.5">
            {detail.labels.length
              ? detail.labels.map((tag) => (
                  <span key={tag.name} className="rounded-md bg-muted px-2 py-px text-xs">
                    {tag.name}
                  </span>
                ))
              : none}
          </FieldRow>
          <FieldRow name="Due date">
            {detail.due
              ? new Date(detail.due).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
              : none}
          </FieldRow>
          <FieldRow name="List" className="flex flex-wrap items-center gap-1">
            {detail.path.map((part, at) => (
              <Fragment key={part}>
                {at > 0 && <span className="text-muted-foreground">/</span>}
                {part}
              </Fragment>
            ))}
          </FieldRow>
        </>
      )}
    </>
  );
}
