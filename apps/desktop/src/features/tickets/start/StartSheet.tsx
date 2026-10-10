import { UNTIL_DONE } from '@mesa/core/browser';
import { Play } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PromptField } from '@/features/prompts/PromptField';
import { useCommand } from '@/lib/useCommand';
import { branchOf, type StartOptions } from '../useStartTicket';

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
 * How a session on one ticket starts, to change before Start session: where it runs, the prompt
 * its goal opens with (or a new one, written here), /goal, assigning, and Write notes; and a
 * preview of its goal.
 */
export function StartSheet(props: {
  ticket: { key: string; mine: boolean; assignee?: string | undefined };
  options: StartOptions;
  onChange: (change: Partial<StartOptions>) => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const { ticket, options } = props;
  const prompts = useCommand('prompts.list');
  const promptText = prompts.data?.find((p) => p.name === options.prompt)?.text;
  // A prompt just written here is picked before this list has it: read the list again.
  const { refresh } = prompts;
  const missing = Boolean(options.prompt && prompts.data && promptText === undefined);
  useEffect(() => {
    if (missing) void refresh();
  }, [missing, refresh]);
  const set = props.onChange;
  return (
    <form
      className="grid gap-5 border-t bg-card px-6 py-5"
      data-testid="start-sheet"
      onSubmit={(event) => {
        event.preventDefault();
        props.onStart();
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
          label="Prompt"
          htmlFor="start-prompt"
          hint="Sent before the ticket: how you like the work done"
        >
          <PromptField
            id="start-prompt"
            value={options.prompt}
            empty="No prompt"
            onChange={(prompt) => set({ prompt })}
          />
        </Field>
      </div>
      <div className="grid gap-3 rounded-lg border bg-background/40 p-4">
        <Toggle
          id="start-until-done"
          label="Keep working until done"
          hint="Starts with Claude Code's /goal: it goes on until the acceptance criteria are met and the tests pass"
          checked={options.untilDone}
          onChange={(untilDone) => set({ untilDone })}
        />
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
        <summary className="cursor-pointer text-muted-foreground">Preview the goal</summary>
        <div className="mt-2 grid max-h-56 gap-2 overflow-auto rounded-md bg-muted p-3 text-xs">
          {options.untilDone && !promptText?.startsWith('/goal') && (
            <pre className="font-mono">/goal</pre>
          )}
          {promptText && <pre className="whitespace-pre-wrap font-mono">{promptText}</pre>}
          <p className="text-muted-foreground">
            {promptText ? 'Then ' : ''}
            {ticket.key}'s title, its link, and where its snapshot and notes are in the vault.
          </p>
          {options.untilDone && <p className="text-muted-foreground">{UNTIL_DONE}</p>}
        </div>
      </details>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit" data-testid="start-sheet-submit">
          <Play aria-hidden /> Start session
        </Button>
      </div>
    </form>
  );
}
