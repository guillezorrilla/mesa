import type { SessionControls } from '@mesa/core';
import { controlChoices, modeChoice } from '@mesa/core/browser';
import { DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { ControlMenu, ControlMenuItem } from './ControlMenu';

/**
 * A Structured session's mode picker, as Claude Desktop's (#1222): Claude's permission modes or
 * Codex's approval presets, each named with what it does and its number key, the current one
 * checked and the one it started in marked Default. Its trigger reads the mode's name.
 */
export function ModePicker(props: {
  controls: SessionControls;
  busy: boolean;
  onPick: (mode: string) => void;
  onReturnFocus?: () => void;
}) {
  const { controls } = props;
  const { modes } = controlChoices(controls);
  return (
    <ControlMenu
      label="Mode"
      trigger={
        <span>{controls.mode ? modeChoice(controls.agent, controls.mode).label : 'Mode'}</span>
      }
      busy={props.busy}
      numbered={modes}
      onPick={(choice) => props.onPick(choice.id)}
      onReturnFocus={props.onReturnFocus}
      className="w-80"
    >
      <DropdownMenuLabel className="px-2.5 pt-1.5 pb-1">Mode</DropdownMenuLabel>
      {modes.map((choice, i) => (
        <ControlMenuItem
          key={choice.id}
          choice={choice}
          checked={controls.mode === choice.id}
          isDefault={choice.id === controls.defaultMode}
          number={i + 1}
          onSelect={() => props.onPick(choice.id)}
        />
      ))}
    </ControlMenu>
  );
}
