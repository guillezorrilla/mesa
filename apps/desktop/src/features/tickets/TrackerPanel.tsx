import type { ProviderId } from '@mesa/core';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';
import { TRACKERS } from './trackers';

/**
 * A centered page of the Tickets tab about one tracker: its icon (or `icon`) in its tint, its
 * name, a heading and a line, then the page's actions.
 */
export function TrackerPanel(props: {
  tracker: ProviderId;
  icon?: LucideIcon;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const { name, icon, tint } = TRACKERS[props.tracker];
  const Icon = props.icon ?? icon;
  return (
    <div className="grid justify-items-center gap-6 px-6 py-14 text-center">
      <div className="grid justify-items-center gap-3">
        <span
          className={cn(
            'grid size-12 place-items-center rounded-xl bg-muted ring-1 ring-border',
            tint,
          )}
        >
          <Icon aria-hidden className="size-6" />
        </span>
        <span className={cn('text-[11px] font-medium uppercase tracking-[0.14em]', tint)}>
          {name}
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
        <Muted className="max-w-[46ch]">{props.lead}</Muted>
      </div>
      {props.children}
    </div>
  );
}
