import type { ProviderId } from '@mesa/core';
import { cn } from '@/lib/utils';
import { TRACKERS } from './trackers';

/** A tracker's small icon in its tint, beside its name or a ticket's id. */
export function TrackerIcon(props: { tracker: ProviderId; className?: string }) {
  const { icon: Icon, tint } = TRACKERS[props.tracker];
  return <Icon aria-hidden className={cn('size-4', tint, props.className)} />;
}
