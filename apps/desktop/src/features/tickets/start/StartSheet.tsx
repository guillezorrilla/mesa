import { type TicketStart, ticketStartPrompt } from '@mesa/core/browser';
import { type ReactNode, useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PromptField } from '@/features/prompts/PromptField';
import { useCommand } from '@/lib/useCommand';
import { branchOf, type StartOptions } from '../useStartTicket';
import { STARTS, StartButtons } from './StartButtons';

/** A labelled switch with a line under it saying what it does. */
function Toggle(props: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={props.id} className="grid gap-0.5 font-normal">
        {props.label}
        <span className="text-xs text-muted-foreground">{props.hint}</span>
      </Label>
      <Switch id={props.id} checked={props.checked} onCheckedChange={props.onChange} />
    </div>
  );
}

/** A field's name over it, and what it does under it. */
function Field(props: { label: string; htmlFor?: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={props.htmlFor} className="text-xs font-medium text-muted-foreground">
        {props.label}
      </Label>
      {props.children}
      <span className="text-xs text-muted-foreground">{props.hint}</span>
    </div>
  );
}

/**
 * How a session on one ticket starts, to change before one of the three start buttons: where it
 * runs, Your rules (a Saved prompt every start follows, or a new one written here), assigning, and
 * Write notes; and the prompt each start sends.
 */
export function StartSheet(props: {
  project: string;
  ticket: { key: string; url: string; title: string; mine: boolean; assignee?: string | undefined };
  options: StartOptions;
  onChange: (change: Partial<StartOptions>) => void;
  onCancel: () => void;
  onStart: (as: TicketStart) => void;
}) {
  const { ticket, options } = props;
  const [shown, setShown] = useState<TicketStart>('goal');
  const prompts = useCommand('prompts.list');
  const rules = prompts.data?.find((p) => p.name === options.prompt)?.text;
  // A prompt just written here is picked before this list has it: read the list again.
  const { refresh } = prompts;
  const missing = Boolean(options.prompt && prompts.data && rules === undefined);
  useEffect(() => {
    if (missing) void refresh();
  }, [missing, refresh]);
  const set = props.onChange;
  // ponytail: the vault paths are known only once the ticket is imported, so these stand in.
  const preview = ticketStartPrompt(shown, {
    project: props.project,
    key: ticket.key,
    title: `${ticket.key}: ${ticket.title}`,
    url: ticket.url,
    snapshot: `raw/jira/${ticket.key}/<latest>.md`,
    note: options.notes ? '<the note Write notes adds>' : undefined,
    rules,
  });
  return (
    <form
      className="grid gap-5 border-t bg-card px-6 py-5"
      data-testid="start-sheet"
      onSubmit={(event) => {
        event.preventDefault();
        props.onStart('goal');
      }}
    >
      <h3 className="text-[15px] font-semibold">Start a session on {ticket.key}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Runs in"
          hint={
            options.start === 'worktree'
              ? `Its own checkout, on the branch ${branchOf(ticket.key)}`
              : "The project's own checkout, on its current branch"
          }
        >
          <SegmentedControl
            label="Runs in"
            wide
            value={options.start}
            options={[
              ['worktree', 'New worktree'],
              ['checkout', 'Main checkout'],
            ]}
            onChange={(start) => set({ start })}
          />
        </Field>
        <Field
          label="Your rules"
          htmlFor="start-prompt"
          hint="Optional. A Saved prompt every start follows, such as how you test or commit"
        >
          <PromptField
            id="start-prompt"
            value={options.prompt}
            empty="None"
            onChange={(prompt) => set({ prompt })}
          />
        </Field>
      </div>
      <div className="grid gap-3 rounded-lg border bg-background/40 p-4">
        {!ticket.mine && (
          <Toggle
            id="start-assign"
            label={`Assign ${ticket.key} to me`}
            hint={ticket.assignee ? `Now assigned to ${ticket.assignee}` : 'Unassigned in Jira'}
            checked={options.assign}
            onChange={(assign) => set({ assign })}
          />
        )}
        <Toggle
          id="start-notes"
          label="Write notes first"
          hint="Adds a minute; the session also gets a summary note"
          checked={options.notes}
          onChange={(notes) => set({ notes })}
        />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">
          Preview what each start sends
        </summary>
        <div className="mt-2 grid gap-2">
          <SegmentedControl
            label="Preview"
            value={shown}
            options={[
              ['session', 'Session'],
              ['investigate', 'Investigate'],
              ['goal', 'Goal'],
            ]}
            onChange={setShown}
          />
          <p className="text-xs text-muted-foreground">
            {STARTS.find((s) => s.as === shown)?.hint}
          </p>
          <pre
            data-testid="start-preview"
            className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap"
          >
            {preview}
          </pre>
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="link"
          className="px-0 text-muted-foreground"
          onClick={props.onCancel}
        >
          Cancel
        </Button>
        <StartButtons onStart={props.onStart} />
      </div>
    </form>
  );
}
