import type { InboxFix, InboxItem } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';

/** What each Doctor fix's button says. */
const FIX_LABEL: Record<InboxFix, string> = {
  'hooks install': 'Enable hooks',
  'hooks update': 'Update hooks',
  'vault init': 'Set up vault',
};

const ICON = {
  'input-required': [CircleAlert, 'text-state-waiting'],
  doctor: [CircleAlert, 'text-state-waiting'],
  automation: [CircleAlert, 'text-state-waiting'],
  finished: [CircleCheck, 'text-state-idle'],
  subagent: [Info, 'text-muted-foreground'],
} as const;

/** One notice: what happened, why it matters, and the action that resolves it. */
export function NotificationRow(props: {
  item: InboxItem;
  busy: boolean;
  onOpen: (item: InboxItem) => void;
  onFix: (fix: InboxFix) => void;
  onClear: (item: InboxItem) => void;
}) {
  const { item } = props;
  const [Icon, tone] = ICON[item.kind];
  const pill =
    'rounded-full bg-accent px-3 py-1 text-xs font-medium hover:bg-accent/70 disabled:opacity-50';
  return (
    <li
      data-testid="inbox-item"
      className={cn(
        'group flex gap-3 border-b px-4 py-3 last:border-b-0',
        !item.read && 'bg-accent/20',
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 size-4 shrink-0', tone)} />
      <div className="min-w-0 flex-1 space-y-1">
        <button
          type="button"
          className="block w-full text-left text-sm font-semibold hover:underline"
          onClick={() => props.onOpen(item)}
        >
          {item.title}
        </button>
        <Muted size="xs">{item.detail ?? (item.session ? `Session ${item.session}` : '')}</Muted>
        {item.kind === 'doctor' && (
          <div className="flex flex-wrap gap-2 pt-1">
            {item.fix && (
              <button
                type="button"
                className={pill}
                disabled={props.busy}
                onClick={() => item.fix && props.onFix(item.fix)}
              >
                {FIX_LABEL[item.fix]}
              </button>
            )}
            <button type="button" className={pill} onClick={() => props.onOpen(item)}>
              Open Doctor
            </button>
          </div>
        )}
        {item.kind === 'automation' && (
          <button type="button" className={pill} onClick={() => props.onOpen(item)}>
            Review automation
          </button>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <time dateTime={item.at} className="text-xs text-muted-foreground">
          {timeAgo(item.at, Date.now())}
        </time>
        <IconButton
          label={`Clear ${item.title}`}
          icon={X}
          size="icon-xs"
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={() => props.onClear(item)}
        />
      </div>
    </li>
  );
}
