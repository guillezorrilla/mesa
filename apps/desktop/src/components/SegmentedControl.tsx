import { cn } from '@/lib/utils';

/** A compact choice of one value among a few, each option a pressed or unpressed button. */
export function SegmentedControl<T extends string | number>(props: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="flex items-center rounded-md border bg-card p-0.5">
      <legend className="sr-only">{props.label}</legend>
      {props.options.map(([value, text]) => (
        <button
          key={String(value)}
          type="button"
          aria-pressed={props.value === value}
          className={cn(
            'rounded px-3 py-1 text-xs text-muted-foreground hover:text-foreground',
            'aria-pressed:bg-accent aria-pressed:text-foreground',
          )}
          onClick={() => props.onChange(value)}
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}
