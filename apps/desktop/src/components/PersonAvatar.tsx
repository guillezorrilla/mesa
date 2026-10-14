import { nameColor } from '@/lib/nameColor';
import { cn } from '@/lib/utils';

/**
 * A person's initials in a small circle, the same color for the same name; a dashed `?` for no one.
 * A name or a login: "Cedric Chou" is CC, "lee-park" is LP.
 */
export function PersonAvatar(props: { name?: string | undefined; className?: string }) {
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
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <span
      title={name}
      style={{ backgroundColor: nameColor(name) }}
      className={cn(
        'inline-grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white',
        props.className,
      )}
    >
      {initials}
    </span>
  );
}
