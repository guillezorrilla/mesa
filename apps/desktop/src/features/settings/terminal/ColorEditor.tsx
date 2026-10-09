import {
  TERMINAL_COLOR_GROUPS,
  type TerminalColorKey,
  type TerminalColors,
} from '@mesa/core/browser';
import { SectionLabel } from '@/components/SectionLabel';
import { ColorField } from './ColorField';

/** A color's name in its group: `brightRed` is Red under Bright. */
const name = (key: TerminalColorKey) =>
  key === 'selectionBackground'
    ? 'Selection'
    : key.replace(/^bright/, '').replace(/^./, (first) => first.toUpperCase());

/** The 20 colors as the editor groups them. */
const GROUPS = [
  { title: 'Base', keys: TERMINAL_COLOR_GROUPS.base },
  { title: 'Normal', keys: TERMINAL_COLOR_GROUPS.normal },
  { title: 'Bright', keys: TERMINAL_COLOR_GROUPS.bright },
];

/** Every palette color, in its group, as a color field. */
export function ColorEditor(props: {
  colors: TerminalColors;
  onChange: (key: TerminalColorKey, color: string) => void;
}) {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <fieldset key={group.title} className="space-y-2">
          <legend className="contents">
            <SectionLabel>{group.title}</SectionLabel>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {group.keys.map((key) => (
              <ColorField
                key={key}
                name={name(key)}
                label={group.title === 'Bright' ? `Bright ${name(key).toLowerCase()}` : undefined}
                color={props.colors[key]}
                testId={`terminal-color-${key}`}
                onChange={(color) => props.onChange(key, color)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
