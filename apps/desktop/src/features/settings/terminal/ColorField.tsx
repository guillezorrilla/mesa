/** One palette color: a native color input, its name and its hex value. */
export function ColorField(props: {
  name: string;
  /** The input's accessible name, when the name alone is ambiguous ("Bright red"). */
  label?: string;
  color: string;
  testId: string;
  onChange: (color: string) => void;
}) {
  const color = props.color.toLowerCase();
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md border bg-background/60 p-1.5 pr-2 transition-colors hover:border-foreground/25 has-focus-visible:ring-2 has-focus-visible:ring-ring">
      <input
        type="color"
        data-testid={props.testId}
        aria-label={props.label ?? props.name}
        value={color}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        className="size-7 shrink-0 cursor-pointer appearance-none rounded border-0 bg-transparent p-0 outline-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border [&::-webkit-color-swatch]:border-foreground/15"
      />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-xs">{props.name}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">{color}</span>
      </span>
    </label>
  );
}
