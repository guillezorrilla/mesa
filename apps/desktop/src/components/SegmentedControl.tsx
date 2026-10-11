import { cn } from '@/lib/utils';

/** The look of a segmented choice, for one built on other parts (a form's radio group). */
export const SEGMENTS = 'flex items-center rounded-md border bg-card p-0.5';
export const SEGMENT =
  'rounded px-3 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-pressed:bg-accent aria-pressed:text-foreground data-[state=checked]:bg-accent data-[state=checked]:text-foreground';

/** A compact choice of one value among a few, each option a pressed or unpressed button. */
export function SegmentedControl<T extends string | number>(props: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  /** Stretches it to its container, each option an equal share, as tall as a select. */
  wide?: boolean;
}) {
  return (
    <fieldset className={cn(SEGMENTS, props.wide && 'h-9 [&>button]:h-full [&>button]:flex-1')}>
      <legend className="sr-only">{props.label}</legend>
      {props.options.map(([value, text]) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={props.value === value}
          className={SEGMENT}
          onClick={() => props.onChange(value)}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
