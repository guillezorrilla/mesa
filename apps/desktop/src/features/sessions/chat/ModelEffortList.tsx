import type { ControlChange, SessionControls } from '@mesa/core';
import { modelLabel } from '@mesa/core/browser';
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

/**
 * A Structured session's model and effort to pick from (#1213, #1218): the agent's models with the
 * current one checked, its efforts beside them. Arrows move and Enter picks; the footer's picker
 * and `/model`'s card both show this list. `autoFocus` takes the keys at once.
 */
export function ModelEffortList(props: {
  controls: SessionControls;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Effort in a column beside the models, every entry in view: the card's layout. */
  wide?: boolean;
  onPick: (change: ControlChange) => void;
  className?: string;
}) {
  const { controls } = props;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (props.autoFocus) root.current?.focus();
  }, [props.autoFocus]);
  // An alias (`opus`) or the model it names (`claude-opus-5-5`, shown as Opus 5.5) checks its entry.
  const picked = controls.model ? modelLabel(controls.model).toLowerCase() : '';
  const item = (key: string, text: string, checked: boolean, change: ControlChange) => (
    <CommandItem
      key={key}
      value={key}
      aria-checked={checked}
      disabled={props.disabled}
      onSelect={() => props.onPick(change)}
    >
      <Check aria-hidden className={cn('text-primary', !checked && 'invisible')} />
      {text}
    </CommandItem>
  );
  return (
    <Command
      ref={root}
      tabIndex={-1}
      label="Model and effort"
      className={cn('outline-none', props.className)}
    >
      <CommandList
        className={cn(
          'max-h-80',
          props.wide && 'max-h-none [&_[cmdk-list-sizer]]:grid [&_[cmdk-list-sizer]]:grid-cols-2',
        )}
      >
        <CommandGroup heading="Model">
          {controls.models.map((one) =>
            item(`model ${one}`, one, picked.startsWith(one), { model: one }),
          )}
        </CommandGroup>
        <CommandGroup heading="Effort">
          {controls.efforts.map((one) =>
            item(`effort ${one}`, one, controls.effort === one, { effort: one }),
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
