import type { ControlChange, SessionControls } from '@mesa/core';
import { controlChoices, effortLabel, modelChoiceLabel, modelLabel } from '@mesa/core/browser';
import {
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { ControlMenu, ControlMenuItem } from './ControlMenu';

/** Whether choice `id` named `label` is the model the agent runs: by its alias, id or name. */
const runs = (model: string | undefined, id: string, label: string) =>
  model !== undefined && (model === id || modelLabel(model) === label);

/**
 * A Structured session's model and effort picker, as Claude Desktop's (#1222): the agent's main
 * models by name with number keys 1 to 4, then Effort and More models as submenus. Its trigger
 * reads the model and effort, `Opus 5.5 Extra`; `open` lets `/model` open it from the composer.
 */
export function ModelPicker(props: {
  controls: SessionControls;
  busy: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPick: (change: ControlChange) => void;
  onReturnFocus?: () => void;
}) {
  const { controls } = props;
  const choices = controlChoices(controls);
  const model = controls.model;
  const name = model ? modelChoiceLabel(controls, model) : 'Model';
  const shown = model && name === model ? modelLabel(model) : name;
  const effort = controls.effortQueued ?? controls.effort;
  return (
    <ControlMenu
      label="Model and effort"
      trigger={
        <>
          <span>{shown}</span>
          {effort && (
            <span className="text-muted-foreground">
              {effortLabel(effort)}
              {controls.effortQueued ? ' after this turn' : ''}
            </span>
          )}
        </>
      }
      busy={props.busy}
      open={props.open}
      onOpenChange={props.onOpenChange}
      numbered={choices.models}
      onPick={(choice) => props.onPick({ model: choice.id })}
      onReturnFocus={props.onReturnFocus}
      className="w-64"
    >
      {choices.models.map((choice, i) => (
        <ControlMenuItem
          key={choice.id}
          choice={choice}
          checked={runs(model, choice.id, choice.label)}
          isDefault={choice.id === controls.defaultModel}
          number={i + 1}
          onSelect={() => props.onPick({ model: choice.id })}
        />
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="rounded-lg px-2.5 py-2">
          <span className="flex-1">Effort</span>
          {effort && <span className="text-muted-foreground">{effortLabel(effort)}</span>}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-44 rounded-xl p-1.5">
          {choices.efforts.map((choice) => (
            <ControlMenuItem
              key={choice.id}
              choice={choice}
              checked={effort === choice.id}
              onSelect={() => props.onPick({ effort: choice.id })}
            />
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {choices.more.length > 0 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="rounded-lg px-2.5 py-2">
              <span className="flex-1">More models</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-72 rounded-xl p-1.5">
              {choices.more.map((choice) => (
                <ControlMenuItem
                  key={choice.id}
                  choice={choice}
                  checked={runs(model, choice.id, choice.label)}
                  isDefault={choice.id === controls.defaultModel}
                  onSelect={() => props.onPick({ model: choice.id })}
                />
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </>
      )}
    </ControlMenu>
  );
}
