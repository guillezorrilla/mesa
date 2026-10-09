import type { TicketDefaults } from '@mesa/core';
import { Check, Loader2, Play, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { branchOf, type StartOptions, useStartTicket } from './useStartTicket';

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

/**
 * Start a session on one ticket: assign it to you (unless it is yours), the prompt, Write notes,
 * where it runs, and a preview of its goal; then each step as it runs, ending in Open session.
 */
export function StartSheet(props: {
  project: string;
  ticket: { key: string; url: string; mine: boolean; assignee?: string | undefined };
  defaults: TicketDefaults;
  /** The ticket prompt the project uses now. */
  prompt: string | null;
  onCancel: () => void;
  onStarted: () => void;
  onSession: (id: string) => void;
}) {
  const { ticket } = props;
  const prompts = useCommand('prompts.list');
  const { steps, session, start, reset } = useStartTicket(props.project);
  const [options, setOptions] = useState<StartOptions>({
    assign: props.defaults.assign && !ticket.mine,
    prompt: props.prompt,
    notes: props.defaults.notes,
    start: props.defaults.start,
  });
  const set = (change: Partial<StartOptions>) => setOptions((was) => ({ ...was, ...change }));
  const promptText = prompts.data?.find((p) => p.name === options.prompt)?.text;

  if (steps) {
    const failed = steps.some((step) => step.state === 'failed');
    return (
      <div className="grid gap-4 border-t bg-card px-6 py-5" data-testid="start-progress">
        <h3 className="text-[15px] font-semibold">Starting {ticket.key}</h3>
        <ol className="grid gap-2.5">
          {steps.map((step) => (
            <li
              key={step.label}
              className={cn(
                'flex items-center gap-2.5 text-sm',
                step.state === 'todo' && 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'grid size-[18px] place-items-center rounded-full border',
                  step.state === 'done' && 'border-state-idle bg-state-idle text-white',
                  step.state === 'failed' && 'border-state-failed bg-state-failed text-white',
                )}
              >
                {step.state === 'done' && <Check aria-hidden className="size-3" />}
                {step.state === 'failed' && <X aria-hidden className="size-3" />}
                {step.state === 'now' && (
                  <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
                )}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
        <div className="flex justify-end gap-2">
          {failed && (
            <Button variant="outline" onClick={reset}>
              Back
            </Button>
          )}
          {session && <Button onClick={() => props.onSession(session)}>Open session</Button>}
        </div>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 border-t bg-card px-6 py-5"
      data-testid="start-sheet"
      onSubmit={(event) => {
        event.preventDefault();
        void start(ticket, options).then((ok) => ok && props.onStarted());
      }}
    >
      <h3 className="text-[15px] font-semibold">Start a session on {ticket.key}</h3>
      {!ticket.mine && (
        <Toggle
          id="start-assign"
          label={`Assign ${ticket.key} to me`}
          hint={ticket.assignee ? `Now assigned to ${ticket.assignee}` : 'Unassigned in Jira'}
          checked={options.assign}
          onChange={(assign) => set({ assign })}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Label htmlFor="start-prompt" className="grid gap-1.5 font-normal">
          <span className="text-xs text-muted-foreground">Prompt</span>
          <NativeSelect
            id="start-prompt"
            value={options.prompt ?? ''}
            onChange={(event) => set({ prompt: event.currentTarget.value || null })}
          >
            <NativeSelectOption value="">No prompt</NativeSelectOption>
            {prompts.data?.map((p) => (
              <NativeSelectOption key={p.name} value={p.name}>
                {p.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
        <Label htmlFor="start-where" className="grid gap-1.5 font-normal">
          <span className="text-xs text-muted-foreground">Start in</span>
          <NativeSelect
            id="start-where"
            value={options.start}
            onChange={(event) => set({ start: event.currentTarget.value as StartOptions['start'] })}
          >
            <NativeSelectOption value="worktree">
              New worktree on {branchOf(ticket.key)}
            </NativeSelectOption>
            <NativeSelectOption value="checkout">Main checkout</NativeSelectOption>
          </NativeSelect>
        </Label>
      </div>
      <Toggle
        id="start-notes"
        label="Write notes first"
        hint="Adds a minute; the session also gets a summary note"
        checked={options.notes}
        onChange={(notes) => set({ notes })}
      />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Preview the goal</summary>
        <div className="mt-2 grid max-h-56 gap-2 overflow-auto rounded-md bg-muted p-3 text-xs">
          {promptText && <pre className="whitespace-pre-wrap font-mono">{promptText}</pre>}
          <p className="text-muted-foreground">
            {promptText ? 'Then ' : ''}
            {ticket.key}'s title, its link, and where its snapshot and notes are in the vault.
          </p>
        </div>
      </details>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          <Play aria-hidden /> Start session
        </Button>
      </div>
    </form>
  );
}
