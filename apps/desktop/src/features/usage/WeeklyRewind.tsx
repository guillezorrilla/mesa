import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useCommand, useRun } from '@/lib/useCommand';
import { compact, money } from './format';

/** The folded Weekly Rewind; its notes and sessions load only once it is opened. */
export function WeeklyRewind(props: { onSession: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section aria-label="Weekly rewind">
      <button
        type="button"
        aria-expanded={open}
        className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((last) => !last)}
      >
        <Chevron aria-hidden className="size-3" /> Weekly rewind
      </button>
      {open && <RewindBody onSession={props.onSession} />}
    </section>
  );
}

function RewindBody(props: { onSession: (id: string) => void }) {
  const rewind = useCommand('rewind.week');
  const run = useRun();
  const data = rewind.data;
  if (!data) return <Muted size="xs">{rewind.busy ? 'Loading...' : ''}</Muted>;
  return (
    <div
      data-testid="weekly-rewind"
      className="space-y-3 rounded-lg border bg-background p-4 text-sm"
    >
      <Muted size="xs">
        {data.from} to {data.through} ({data.timezone}). Seven local calendar days:{' '}
        {data.notes.length} meaningful notes, {data.sessions.length} ended sessions,{' '}
        {compact(data.usage.input)} input and {compact(data.usage.output)} output tokens,{' '}
        {money(data.usage.estimatedCostUsd)} estimated.
      </Muted>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {data.notes.map((note) => (
          <div key={note.id}>
            <Button
              variant="link"
              className="h-auto p-0 text-left"
              onClick={() => void run('vault.openNote', { note: note.path })}
            >
              {note.summary}
            </Button>
            <Muted size="xs">
              {note.kind} · {note.path}
            </Muted>
          </div>
        ))}
        {data.sessions.map((session) => (
          <div key={session.id}>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => props.onSession(session.id)}
            >
              {session.name}
            </Button>
            <Muted size="xs">
              {session.project} · {session.agent} · {session.state}
            </Muted>
          </div>
        ))}
      </div>
      {data.missing.map((reason) => (
        <p key={reason} className="text-xs text-muted-foreground">
          Missing data: {reason}
        </p>
      ))}
    </div>
  );
}
