import type { Ticket } from '@mesa/core';
import { CircleCheck, CircleDot } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A GitHub issue's state as GitHub shows it: a green Open pill, or a purple Closed one. */
export function GithubState({ ticket }: { ticket: Ticket }) {
  const closed = ticket.category === 'done';
  const Icon = closed ? CircleCheck : CircleDot;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-1.5 text-xs font-medium text-white',
        closed ? 'bg-issue-closed' : 'bg-issue-open',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {closed ? 'Closed' : 'Open'}
    </span>
  );
}
