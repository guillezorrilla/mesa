/**
 * A Linear priority as Linear draws it: Urgent as an orange square with an exclamation mark, the
 * others as three bars, filled up to the level (High three, Medium two, Low one, none empty).
 */
export function LinearPriority(props: { level: number }) {
  if (props.level === 1)
    return (
      <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0">
        <rect x="1" y="1" width="12" height="12" rx="3" fill="oklch(0.65 0.19 45)" />
        <path d="M7 3.8v4M7 9.6v.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  // Linear's levels run 1 (urgent) to 4 (low); 0 is none.
  const filled = props.level ? 5 - props.level : 0;
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0">
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 4}
          y={9 - bar * 3}
          width="3"
          height={4 + bar * 3}
          rx="1"
          fill={bar < filled ? 'currentColor' : 'var(--border)'}
        />
      ))}
    </svg>
  );
}
