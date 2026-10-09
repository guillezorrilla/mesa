import type { TerminalColorKey, TerminalColors } from '@mesa/core/browser';
import { SectionLabel } from '@/components/SectionLabel';

const NAMES = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
const ansi = (prefix: string) =>
  NAMES.map((name) => [`${prefix}${prefix ? name : name.toLowerCase()}`, name] as const);

/** The 20 colors as the editor groups them, each key with its name. */
const GROUPS = [
  {
    title: 'Base',
    colors: [
      ['background', 'Background'],
      ['foreground', 'Foreground'],
      ['cursor', 'Cursor'],
      ['selectionBackground', 'Selection'],
    ],
  },
  { title: 'Normal', colors: ansi('') },
  { title: 'Bright', colors: ansi('bright') },
] as { title: string; colors: (readonly [TerminalColorKey, string])[] }[];

/** Every palette color as a native color input with its hex value. */
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
            {group.colors.map(([key, name]) => (
              <label
                key={key}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border bg-background/60 p-1.5 pr-2 transition-colors hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="color"
                  data-testid={`terminal-color-${key}`}
                  aria-label={group.title === 'Bright' ? `Bright ${name.toLowerCase()}` : name}
                  value={props.colors[key].toLowerCase()}
                  onChange={(event) => props.onChange(key, event.currentTarget.value)}
                  className="size-7 shrink-0 cursor-pointer appearance-none rounded border-0 bg-transparent p-0 outline-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-foreground/15"
                />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-xs">{name}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {props.colors[key].toLowerCase()}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
