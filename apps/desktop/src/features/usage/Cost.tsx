import { cn } from '@/lib/utils';
import { money } from './format';

/**
 * An estimate in dollars. When part of it has no list price or could not be read, the priced part
 * shows with a `+`; when none of it is priced, a quiet n/a.
 */
export function Cost(props: { value: number | null; known: number; className?: string }) {
  if (props.value !== null)
    return <span className={cn('tabular-nums', props.className)}>{money(props.value)}</span>;
  if (props.known > 0)
    return (
      <span
        className={cn('tabular-nums', props.className)}
        title="Priced usage only: some usage has no list price or could not be read"
      >
        {money(props.known)}
        <span className="text-muted-foreground">+</span>
      </span>
    );
  return (
    <span
      className={cn('font-normal text-muted-foreground', props.className)}
      title="No list price"
    >
      n/a
    </span>
  );
}
