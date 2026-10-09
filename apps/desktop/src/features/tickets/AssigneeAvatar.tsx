import { cn } from '@/lib/utils';

const HUES = [18, 210, 145, 265, 40, 330, 185];

/** A person's initials in a small circle, the same color for the same name. */
export function AssigneeAvatar(props: { name?: string | undefined; className?: string }) {
  const { name } = props;
  if (!name)
    return (
      <span
        title="Unassigned"
        className={cn(
          'inline-grid size-5 shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/60 text-[10px] text-muted-foreground',
          props.className,
        )}
      >
        ?
      </span>
    );
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  const hue = HUES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span
      title={name}
      style={{ backgroundColor: `oklch(0.62 0.14 ${hue})` }}
      className={cn(
        'inline-grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white',
        props.className,
      )}
    >
      {initials}
    </span>
  );
}
