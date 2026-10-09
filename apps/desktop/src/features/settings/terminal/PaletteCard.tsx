import type { TerminalColors } from '@mesa/core/browser';
import { Check, Pipette } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

const NORMAL = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const;

/** A palette in miniature: a prompt and a listing in its colors over its ANSI strip. */
function Screen(props: { colors: TerminalColors; style?: CSSProperties }) {
  const { colors } = props;
  return (
    <div
      className="absolute inset-0 flex flex-col font-mono text-[10px] leading-[1.35]"
      style={{ background: colors.background, color: colors.foreground, ...props.style }}
    >
      <div className="flex-1 px-2 pt-1.5">
        <div>
          <span style={{ color: colors.green }}>❯</span> ls
        </div>
        <div>
          <span style={{ color: colors.blue }}>src/</span>{' '}
          <span style={{ color: colors.green }}>run.sh</span>{' '}
          <span style={{ color: colors.magenta }}>logo</span>{' '}
          <span
            className="inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em]"
            style={{ background: colors.cursor }}
          />
        </div>
      </div>
      <div className="flex h-1.5">
        {NORMAL.map((key) => (
          <span key={key} className="flex-1" style={{ background: colors[key] }} />
        ))}
      </div>
    </div>
  );
}

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
            <Screen colors={props.colors} />
            {props.split && (
              <Screen
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
