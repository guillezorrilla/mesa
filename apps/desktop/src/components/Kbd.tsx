import type { ReactNode } from 'react';
import { keyCaps } from '@/lib/shortcutKeys';
import { cn } from '@/lib/utils';

const CAP =
  'inline-flex min-w-5 items-center justify-center rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted-foreground';

/** Key caps: a shortcut such as `Mod+Shift+K` as ⌘ ⇧ K, or one named key such as `esc`. */
export function Kbd(props: { shortcut?: string; children?: ReactNode; className?: string }) {
  if (props.shortcut === undefined)
    return <kbd className={cn(CAP, props.className)}>{props.children}</kbd>;
  return (
    <span
      role="img"
      aria-label={props.shortcut}
      className={cn('inline-flex gap-1', props.className)}
    >
      {keyCaps(props.shortcut).map((cap, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: A shortcut's caps are fixed text.
        <kbd key={index} className={CAP}>
          {cap}
        </kbd>
      ))}
    </span>
  );
}
