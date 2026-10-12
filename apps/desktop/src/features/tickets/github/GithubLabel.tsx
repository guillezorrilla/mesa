import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A label's color as CSS: GitHub's hex with no #; undefined for none. */
export const labelHex = (color: string | undefined) =>
  color && /^[0-9a-f]{6}$/i.test(color) ? `#${color}` : undefined;

/**
 * A GitHub label as GitHub draws it: a pill tinted with its own color (hex, no #), with anything
 * after its name, such as a remove mark.
 */
export function GithubLabel(props: {
  name: string;
  color?: string | undefined;
  className?: string;
  children?: ReactNode;
}) {
  const color = labelHex(props.color);
  return (
    <span
      style={
        color
          ? {
              borderColor: `color-mix(in oklch, ${color} 45%, transparent)`,
              backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)`,
              color: `color-mix(in oklch, ${color} 70%, var(--foreground))`,
            }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-xs font-medium',
        !color && 'bg-muted',
        props.className,
      )}
    >
      {props.name}
      {props.children}
    </span>
  );
}
