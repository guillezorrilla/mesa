import type { ProviderId, TicketDefaults } from '@mesa/core';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { PromptField } from '@/features/prompts/PromptField';
import { TrackerIcon } from './TrackerIcon';
import { TRACKERS } from './trackers';
import { useTicketSettings } from './useTicketSettings';

/**
 * The gear's settings for this project's ticket sessions: the prompt (its own, or the default
 * all projects share), Write notes, Assign to me, and where a session starts; then where the
 * project tracks work, with Change, and anything more its tracker shows there.
 */
export function TicketSettingsPanel(props: {
  project: string;
  projectPrompt: string | null;
  /** The prompt in force: the project's own, else the profile's. */
  prompt: string | null;
  defaults: TicketDefaults;
  tracker: ProviderId;
  /** How many of its tracker's views (or repos) the project follows. */
  following: number;
  onChanged: () => void;
  onSwitch: () => void;
}) {
  const { name, unit, Settings } = TRACKERS[props.tracker];
  const {
    saving: acting,
    setDefault,
    setPrompt,
    setSharedPrompt,
  } = useTicketSettings(props.project, props.onChanged);
  const profilePrompt = props.projectPrompt ? undefined : props.prompt;
  return (
    <div className="grid w-80 max-w-[calc(100vw-3rem)] gap-4 p-1" data-testid="ticket-settings">
      <Label htmlFor="ticket-prompt" className="grid gap-1.5 font-normal">
        <span className="text-xs text-muted-foreground">Prompt for this project</span>
        <PromptField
          id="ticket-prompt"
          value={props.projectPrompt}
          empty={`Use the default${profilePrompt ? ` (${profilePrompt})` : ''}`}
          disabled={acting}
          onChange={setPrompt}
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
            onChange={setSharedPrompt}
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
      <div className="flex items-center gap-2.5 border-t pt-3.5">
        <TrackerIcon tracker={props.tracker} />
        <span className="grid flex-1 text-sm">
          Tracks work in {name}
          <span className="text-xs text-muted-foreground">
            {props.following} followed {unit}
            {props.following === 1 ? '' : 's'}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={props.onSwitch}>
          Change
        </Button>
      </div>
      {Settings && <Settings project={props.project} />}
    </div>
  );
}
