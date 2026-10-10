import type { TicketDefaults } from '@mesa/core';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { PromptField } from '@/features/prompts/PromptField';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/**
 * The gear's settings for this project's ticket sessions: the prompt (its own, or the default
 * all projects share), Write notes, Assign to me, and where a session starts.
 */
export function TicketSettingsPanel(props: {
  project: string;
  projectPrompt: string | null;
  /** The prompt in force: the project's own, else the profile's. */
  prompt: string | null;
  defaults: TicketDefaults;
  onChanged: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const profilePrompt = props.projectPrompt ? undefined : props.prompt;
  const save = (call: () => Promise<unknown>) =>
    void act(async () => {
      if (await call()) props.onChanged();
      return undefined;
    });
  const setDefault = (change: Partial<TicketDefaults>) =>
    save(() => run('tickets.defaults', { project: props.project, change }));
  const setPrompt = (name: string, project?: string) =>
    save(() =>
      run('tickets.prompt', { ...(name ? { name } : {}), ...(project ? { project } : {}) }),
    );
  return (
    <div className="grid w-80 max-w-[calc(100vw-3rem)] gap-4 p-1" data-testid="ticket-settings">
      <Label htmlFor="ticket-prompt" className="grid gap-1.5 font-normal">
        <span className="text-xs text-muted-foreground">Prompt for this project</span>
        <PromptField
          id="ticket-prompt"
          value={props.projectPrompt}
          empty={`Use the default${profilePrompt ? ` (${profilePrompt})` : ''}`}
          disabled={acting}
          onChange={(name) => setPrompt(name ?? '', props.project)}
        />
      </Label>
      {profilePrompt !== undefined && (
        <Label htmlFor="ticket-default-prompt" className="grid gap-1.5 font-normal">
          <span className="text-xs text-muted-foreground">Default for all projects</span>
          <PromptField
            id="ticket-default-prompt"
            value={profilePrompt}
            empty="No prompt"
            disabled={acting}
            onChange={(name) => setPrompt(name ?? '')}
          />
        </Label>
      )}
      <Label htmlFor="ticket-start" className="grid gap-1.5 font-normal">
        <span className="text-xs text-muted-foreground">Start sessions in</span>
        <NativeSelect
          id="ticket-start"
          value={props.defaults.start}
          disabled={acting}
          onChange={(event) =>
            setDefault({ start: event.currentTarget.value as TicketDefaults['start'] })
          }
        >
          <NativeSelectOption value="worktree">A new worktree per ticket</NativeSelectOption>
          <NativeSelectOption value="checkout">The main checkout</NativeSelectOption>
        </NativeSelect>
      </Label>
      {(
        [
          ['notes', 'Write notes first', 'A summary note in the vault before the session starts'],
          ['assign', 'Assign to me on start', "When the ticket is someone else's or no one's"],
          [
            'untilDone',
            'Keep working until done',
            "Start with Claude Code's /goal, held to the ticket's acceptance criteria and tests",
          ],
        ] as const
      ).map(([key, label, hint]) => (
        <div key={key} className="flex items-center justify-between gap-4">
          <Label htmlFor={`ticket-${key}`} className="grid gap-0.5 font-normal">
            {label}
            <span className="text-xs text-muted-foreground">{hint}</span>
          </Label>
          <Switch
            id={`ticket-${key}`}
            checked={props.defaults[key]}
            disabled={acting}
            onCheckedChange={(on) => setDefault({ [key]: on })}
          />
        </div>
      ))}
    </div>
  );
}
