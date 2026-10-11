import { branchOf, type TicketStart } from '@mesa/core/browser';
import { type ReactNode, useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PromptField } from '@/features/prompts/PromptField';
import { StartButtons } from './StartButtons';
import { StartPreviewPanel } from './StartPreviewPanel';
import type { StartOptions, StartTicket } from './startOptions';
import { DEFAULT_START, STARTS } from './starts';

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
 * The options every Ticket start uses, to change before pressing one: where it runs, Your rules (a
 * Saved prompt, or a new one written here), assigning, and Write notes; with the preview, and the
 * start buttons over a line saying what the one pointed at does.
 */
export function StartSheet(props: {
  project: string;
  ticket: StartTicket;
  options: StartOptions;
  onChange: (change: Partial<StartOptions>) => void;
  onClose: () => void;
  onStart: (kind: TicketStart) => void;
}) {
  const { ticket, options } = props;
  // The start the caption describes and the preview shows: the one last pointed at or picked.
  const [selected, setSelected] = useState<TicketStart>(DEFAULT_START);
  const set = props.onChange;
  return (
    <div className="@container grid gap-5 border-t bg-card px-6 py-5" data-testid="start-sheet">
      <h3 className="text-[15px] font-semibold">Start a session on {ticket.key}</h3>
      <div className="grid gap-4 @lg:grid-cols-2">
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
      <StartPreviewPanel
        project={props.project}
        ticket={ticket}
        prompt={options.prompt}
        notes={options.notes}
        previewed={selected}
        onPreview={setSelected}
      />
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="link"
            className="px-0 text-muted-foreground"
            onClick={props.onClose}
          >
            Close
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StartButtons onStart={props.onStart} onPoint={setSelected} />
          </div>
        </div>
        <p aria-live="polite" className="text-right text-xs text-muted-foreground">
          {STARTS[selected].hint}
        </p>
      </div>
    </div>
  );
}
