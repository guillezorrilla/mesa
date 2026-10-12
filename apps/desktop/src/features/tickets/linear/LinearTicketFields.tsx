import { FieldRow } from '../FieldRow';
import type { TicketFieldsProps } from '../ticketFields';
import { cycleDates } from './cycleDates';
import { LinearPriority } from './LinearPriority';

const none = <span className="text-muted-foreground">None</span>;

/**
 * Linear's fields after Status and Assignee: priority with Linear's icon, labels, cycle with its
 * dates, estimate in points, and project.
 */
export function LinearTicketFields({ ticket, detail }: TicketFieldsProps<'linear'>) {
  if (!detail)
    return ticket.priority ? <FieldRow name="Priority">{ticket.priority}</FieldRow> : null;
  const { estimate } = detail;
  return (
    <>
      <FieldRow name="Priority" className="flex items-center gap-2">
        <LinearPriority level={detail.priorityLevel} />
        {detail.priority}
      </FieldRow>
      {detail.labels.length > 0 && (
        <FieldRow name="Labels" className="flex flex-wrap gap-1.5">
          {detail.labels.map((label) => (
            <span
              key={label.name}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              {label.color && (
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
              )}
              {label.name}
            </span>
          ))}
        </FieldRow>
      )}
      <FieldRow name="Cycle" className="flex flex-wrap items-center gap-2">
        {detail.cycle ? (
          <>
            {detail.cycle.name}
            <span className="text-muted-foreground">{cycleDates(detail.cycle)}</span>
          </>
        ) : (
          none
        )}
      </FieldRow>
      <FieldRow name="Estimate">
        {estimate === undefined ? none : `${estimate} point${estimate === 1 ? '' : 's'}`}
      </FieldRow>
      <FieldRow name="Project">{detail.project ?? none}</FieldRow>
    </>
  );
}
