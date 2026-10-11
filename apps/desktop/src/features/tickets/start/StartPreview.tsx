import { type TicketStart, ticketStartPreview } from '@mesa/core/browser';
import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useCommand } from '@/lib/useCommand';
import type { StartTicket } from './startOptions';
import { DEFAULT_START, STARTS, startList } from './starts';

/** The prompt each Ticket start sends for `ticket`, one at a time, with Your rules after it. */
export function StartPreview(props: {
  project: string;
  ticket: StartTicket;
  /** Your rules: a Saved prompt's name, or null for none. */
  rules: string | null;
  notes: boolean;
}) {
  const { ticket } = props;
  const [previewed, setPreviewed] = useState<TicketStart>(DEFAULT_START);
  const prompts = useCommand('prompts.list');
  const rules = prompts.data?.find((p) => p.name === props.rules)?.text;
  // A prompt just written in the sheet is picked before this list has it: read the list again.
  const { refresh } = prompts;
  const missing = Boolean(props.rules && prompts.data && rules === undefined);
  useEffect(() => {
    if (missing) void refresh();
  }, [missing, refresh]);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">
        Preview what each start sends
      </summary>
      <div className="mt-2 grid gap-2">
        <SegmentedControl
          label="Preview"
          value={previewed}
          options={startList().map((s) => [s.kind, s.tab] as const)}
          onChange={setPreviewed}
        />
        <p className="text-xs text-muted-foreground">{STARTS[previewed].hint}</p>
        <pre
          data-testid="start-preview"
          className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap"
        >
          {ticketStartPreview(previewed, {
            project: props.project,
            key: ticket.key,
            summary: ticket.title,
            url: ticket.url,
            notes: props.notes,
            rules,
          })}
        </pre>
      </div>
    </details>
  );
}
