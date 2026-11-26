import {
  type SidebarTab,
  type SidebarTabId,
  type SidebarTabStyle,
  showsLabel,
} from '@mesa/core/browser';
import { MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { CountPill } from '@/components/CountPill';
import { IconButton } from '@/components/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { SidebarTabsPanel } from '@/features/sidebar/SidebarTabsPanel';
import { SIDEBAR_TAB_ICONS } from '@/features/sidebar/sidebarTabIcons';
import type { SidebarTabsSettings } from '@/features/sidebar/useSidebarTabs';
import { cn } from '@/lib/utils';
import { useFittingTabStyle } from './useFittingTabStyle';

/** Sessions' count is muted, any other the accent. */
const TONE = {
  muted: 'bg-muted text-foreground',
  accent: 'bg-state-working text-background',
};
/** Each style's count: Labels' and Icons' a small badge on the icon's corner, taking no width. */
const BADGE: Record<SidebarTabStyle, string> = {
  labels:
    'absolute -top-1.5 -right-1.5 min-w-3 rounded-full px-0.5 text-center text-[9px] leading-3 tabular-nums',
  compact: 'rounded px-1',
  icons:
    'absolute top-0.5 right-0 min-w-3.5 rounded-full px-0.5 text-center text-[9px] leading-3.5 tabular-nums',
};

/**
 * One tab in a style: Labels shows its label and count on an equal share of the bar, the label
 * cut to an ellipsis down to about 3 characters (narrower, the bar overflows and falls back);
 * Compact the label only while active; Icons its count as a small badge on the icon. A hidden
 * label is still its name, and the tooltip shows it whole.
 */
function Tab(props: {
  tab: SidebarTab;
  style: SidebarTabStyle;
  on: boolean;
  count?: number;
  /** Sessions waiting for input: a dot beside the count. */
  waiting?: number;
  onClick: () => void;
}) {
  const { tab, style, on, count = 0, waiting = 0 } = props;
  const Icon = SIDEBAR_TAB_ICONS[tab.id];
  const icons = style === 'icons';
  const labels = style === 'labels';
  const sessions = tab.id === 'sessions';
  // Sessions' count shows at 0 beside its icon, as its list's size; a badge only for some.
  const counted = count > 0 || (sessions && !icons);
  const marks = (
    <>
      {counted && (
        <CountPill
          count={count}
          className={cn(BADGE[style], TONE[sessions ? 'muted' : 'accent'])}
        />
      )}
      {waiting > 0 && (
        <span
          data-testid="sessions-waiting"
          role="img"
          aria-label={`${waiting} waiting for input`}
          className={cn(
            'inline-block size-2 rounded-full bg-state-waiting',
            icons && 'absolute bottom-1 right-0.5 size-1.5 ring-2 ring-card',
            labels && 'absolute -right-1 -bottom-0.5 size-1.5 ring-2 ring-card',
          )}
        />
      )}
    </>
  );
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      title={tab.label}
      className={cn(
        'relative flex items-center whitespace-nowrap border-b-2 border-transparent py-2 text-xs font-semibold text-muted-foreground hover:text-foreground',
        labels ? 'flex-1 basis-0 justify-center gap-0.5 px-0.5' : 'shrink-0 gap-1.5 px-2',
        on && 'border-ring text-foreground',
      )}
      onClick={props.onClick}
    >
      {labels ? (
        // The count and dot sit on the icon's corner, so a tab is as narrow with them as without.
        <span className={cn('relative flex shrink-0', counted && 'mr-1')}>
          <Icon aria-hidden className="size-3.5" />
          {marks}
        </span>
      ) : (
        <Icon aria-hidden className="size-3.5 shrink-0" />
      )}
      <span
        className={cn(
          !showsLabel(style, on) && 'sr-only',
          // Its minimum is the tab's: a bar too narrow for every tab at 3 characters overflows.
          labels && 'w-0 min-w-[3ch] max-w-fit grow truncate',
        )}
      >
        {tab.label}
      </span>
      {!labels && marks}
    </button>
  );
}

/**
 * The sidebar's tab bar: the shown tabs in their order and style (useSidebarTabs), a style that
 * does not fit giving way to a denser one. Right-click, or Customize tabs in its menu, opens the
 * controls in a popover.
 */
export function SidebarTabs(props: {
  settings: SidebarTabsSettings;
  tab: SidebarTabId;
  /** Each tab's count: Sessions' sessions listed, Reviews' PRs that ask something of me. */
  counts: Partial<Record<SidebarTabId, number>>;
  /** The visual alert's count (0 when it is off), a dot on Sessions. */
  waiting: number;
  onTab: (tab: SidebarTabId) => void;
}) {
  const { settings, tab, counts } = props;
  const [customizing, setCustomizing] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const { shown } = settings;
  const content = `${tab}|${shown.map((each) => `${each.id}:${counts[each.id] ?? 0}`).join()}`;
  const style = useFittingTabStyle(bar, settings.style, content);
  return (
    <Popover open={customizing} onOpenChange={setCustomizing}>
      <PopoverAnchor asChild>
        <div className="flex min-w-0 flex-1 items-center">
          <div
            ref={bar}
            role="tablist"
            aria-label="Workspace"
            data-style={style}
            className={cn('flex min-w-0 flex-1 overflow-hidden', style !== 'labels' && 'gap-0.5')}
            onContextMenu={(event) => {
              event.preventDefault();
              setCustomizing(true);
            }}
          >
            {shown.map((each) => (
              <Tab
                key={each.id}
                tab={each}
                style={style}
                on={tab === each.id}
                count={counts[each.id]}
                waiting={each.id === 'sessions' ? props.waiting : undefined}
                onClick={() => props.onTab(each.id)}
              />
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Tab bar menu" icon={MoreHorizontal} className="size-7" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
              <DropdownMenuItem onSelect={() => setCustomizing(true)}>
                <SlidersHorizontal aria-hidden /> Customize tabs
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        aria-label="Customize tabs"
        data-testid="customize-tabs"
        className="w-72 p-3"
      >
        <SidebarTabsPanel settings={settings} shown={style} />
      </PopoverContent>
    </Popover>
  );
}
