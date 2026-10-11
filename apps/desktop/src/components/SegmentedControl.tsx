import { RadioGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * A compact choice of one value among a few: a radio group drawn as joined segments, so arrows
 * move it. Controlled with `value`, or left to itself with `defaultValue` and sent as the form's
 * `name`.
 */
export function SegmentedControl<T extends string | number>(props: {
  label: string;
  options: readonly (readonly [T, string])[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  name?: string;
  /** Stretches it to its container, each option an equal share, as tall as a select. */
  wide?: boolean;
  className?: string;
}) {
  const key = (value: T | undefined) => (value === undefined ? undefined : String(value));
  return (
    <RadioGroup.Root
      aria-label={props.label}
      name={props.name}
      value={key(props.value)}
      defaultValue={key(props.defaultValue)}
      onValueChange={(picked) => {
        const option = props.options.find(([value]) => String(value) === picked);
        if (option) props.onChange?.(option[0]);
      }}
      className={cn(
        'flex items-center rounded-md border bg-card p-0.5',
        props.wide && 'h-9 [&>button]:flex-1',
        props.className,
      )}
    >
      {props.options.map(([value, text]) => (
        <RadioGroup.Item
          key={String(value)}
          value={String(value)}
          className="h-full rounded px-3 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-accent data-[state=checked]:text-foreground"
        >
          {text}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
