import type { TerminalColors } from '@mesa/core/browser';
import { Check, Pipette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PaletteMiniature } from './PaletteMiniature';

/**
 * One palette to pick, drawn as a tiny terminal in its own colors. Follow draws both of its
 * palettes split on a diagonal; Custom without colors yet draws an invitation to edit one.
 */
export function PaletteCard(props: {
  label: string;
  /** What the card means, on hover. */
  title?: string;
  colors?: TerminalColors;
  /** Follow's second palette, drawn over the first's right half. */
  split?: TerminalColors;
  active: boolean;
  testId: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      data-testid={props.testId}
      title={props.title}
      onClick={props.onPick}
      className="group flex min-w-0 flex-col gap-1.5 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        className={cn(
          'relative block h-14 overflow-hidden rounded-md border shadow-xs transition-shadow',
          'group-hover:ring-2 group-hover:ring-foreground/15',
          props.active && 'ring-2 ring-primary group-hover:ring-primary',
          !props.colors && 'border-dashed bg-muted/40',
        )}
      >
        {props.colors ? (
          <>
            <PaletteMiniature colors={props.colors} />
            {props.split && (
              <PaletteMiniature
                colors={props.split}
                style={{ clipPath: 'polygon(62% 0, 100% 0, 100% 100%, 38% 100%)' }}
              />
            )}
          </>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Pipette aria-hidden className="size-3.5" />
            Edit any color
          </span>
        )}
      </span>
      <span className="flex items-center gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate text-xs">{props.label}</span>
        {props.active && <Check aria-hidden className="size-3.5 shrink-0 text-primary" />}
      </span>
    </button>
  );
}
