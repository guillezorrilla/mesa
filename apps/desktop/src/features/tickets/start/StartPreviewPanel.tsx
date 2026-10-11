import { type TicketStart, ticketStartPreview } from '@mesa/core/browser';
import { useEffect } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useCommand } from '@/lib/useCommand';
import type { StartTicket } from './startOptions';
import { START_LIST } from './starts';

/** The prompt the `previewed` Ticket start sends for `ticket`, with Your rules after it. */
export function StartPreviewPanel(props: {
  project: string;
  ticket: StartTicket;
  /** Your rules: a Saved prompt's name, or null for none. */
  prompt: string | null;
  notes: boolean;
  previewed: TicketStart;
  onPreview: (kind: TicketStart) => void;
}) {
  const { ticket } = props;
  const prompts = useCommand('prompts.list');
  const rules = prompts.data?.find((p) => p.name === props.prompt)?.text;
  // A prompt just written in the sheet is picked before this list has it: read the list again.
  const { refresh } = prompts;
  const missing = Boolean(props.prompt && prompts.data && rules === undefined);
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
          value={props.previewed}
          options={START_LIST.map((s) => [s.kind, s.tab] as const)}
          onChange={props.onPreview}
        />
        <pre
          data-testid="start-preview"
          className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap"
        >
          {ticketStartPreview(props.previewed, {
            project: props.project,
            key: ticket.key,
            summary: ticket.summary,
            url: ticket.url,
            notes: props.notes,
            rules,
          })}
        </pre>
      </div>
    </details>
  );
}
