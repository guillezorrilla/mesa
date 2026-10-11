import { BookMarked } from 'lucide-react';
import { FieldRow } from '../FieldRow';
import type { TicketFieldsProps } from '../ticketFields';
import { GithubLabel } from './GithubLabel';

/** GitHub's fields after State and Assignees: labels in their colors, milestone, and repository. */
export function GithubTicketFields({ ticket, detail }: TicketFieldsProps<'github'>) {
  const repository = detail?.repository ?? ticket.key.slice(0, ticket.key.lastIndexOf('#'));
  return (
    <>
      {detail && detail.labels.length > 0 && (
        <FieldRow name="Labels" className="flex flex-wrap gap-1.5">
          {detail.labels.map((label) => (
            <GithubLabel key={label.name} {...label} />
          ))}
        </FieldRow>
      )}
      {detail && (
        <FieldRow name="Milestone">
          {detail.milestone ?? <span className="text-muted-foreground">None</span>}
        </FieldRow>
      )}
      <FieldRow name="Repository" className="flex items-center gap-1.5">
        <BookMarked aria-hidden className="size-3.5 text-muted-foreground" />
        {repository}
      </FieldRow>
    </>
  );
}
