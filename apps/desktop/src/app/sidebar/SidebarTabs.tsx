import type { SidebarTab, SidebarTabId, SidebarTabStyle } from '@mesa/core/browser';
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

/** Sessions' count in its muted pill, any other in the accent one. */
const PILL = {
  muted: 'rounded bg-muted px-1 text-foreground',
  accent: 'rounded bg-state-working px-1 text-background',
};

/**
 * One tab in a style: Labels shows its label and count, Compact the label only while active,
 * Icons its count as a small badge on the icon. A hidden label is still its name.
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
  const labelled = style === 'labels' || (style === 'compact' && on);
  const tone = tab.id === 'sessions' ? 'muted' : 'accent';
  // Sessions' count shows at 0 beside a label, as its list's size; a badge only for some.
  const pill = style !== 'icons' && (count > 0 || tab.id === 'sessions');
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      title={tab.label}
      className={cn(
        'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-2 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground',
        on && 'border-ring text-foreground',
      )}
      onClick={props.onClick}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className={labelled ? undefined : 'sr-only'}>{tab.label}</span>
      {pill && <CountPill count={count} className={PILL[tone]} />}
      {style === 'icons' && count > 0 && (
        <CountPill
          count={count}
          className={cn(
            'absolute top-0.5 right-0 min-w-3.5 px-0.5 text-center text-[9px] leading-3.5 tabular-nums',
            PILL[tone],
            'rounded-full',
          )}
        />
      )}
      {waiting > 0 && (
        <span
          data-testid="sessions-waiting"
          role="img"
          aria-label={`${waiting} waiting for input`}
          className={cn(
            'inline-block size-2 rounded-full bg-state-waiting',
            style === 'icons' && 'absolute bottom-1 right-0.5 size-1.5 ring-2 ring-card',
          )}
        />
      )}
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
  const shown = settings.tabs.filter((each) => each.shown);
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
            className="flex min-w-0 flex-1 gap-0.5 overflow-hidden"
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
        <SidebarTabsPanel settings={settings} />
      </PopoverContent>
    </Popover>
  );
}
