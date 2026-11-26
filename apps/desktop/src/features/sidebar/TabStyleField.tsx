import { SIDEBAR_TAB_STYLES, type SidebarTabStyle } from '@mesa/core/browser';
import { SegmentedControl } from '@/components/SegmentedControl';
import { cn } from '@/lib/utils';
import { SIDEBAR_TAB_ICONS } from './sidebarTabIcons';
import type { SidebarTabsSettings } from './useSidebarTabs';

const NAMES: Record<SidebarTabStyle, string> = {
  labels: 'Labels',
  compact: 'Compact',
  icons: 'Icons',
};

const PREVIEW_TABS = [
  SIDEBAR_TAB_ICONS.sessions,
  SIDEBAR_TAB_ICONS.projects,
  SIDEBAR_TAB_ICONS.reviews,
];

/** A tab bar in miniature: the first tab active, a line standing for each label the style shows. */
function StylePreview(props: { style: SidebarTabStyle }) {
  return (
    <span aria-hidden className="flex h-5 w-full items-end gap-1 border-b border-border/70 px-0.5">
      {PREVIEW_TABS.map((Icon, at) => {
        const labelled = props.style === 'labels' || (props.style === 'compact' && at === 0);
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed picture.
            key={at}
            className={cn(
              'relative -mb-px flex items-center gap-0.5 border-b pb-1',
              at === 0 ? 'border-ring text-foreground' : 'border-transparent opacity-60',
            )}
          >
            <Icon className="size-2.5" />
            {labelled && <span className="h-[3px] w-3 rounded-full bg-current opacity-70" />}
            {props.style === 'icons' && at === 2 && (
              <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-state-working" />
            )}
          </span>
        );
      })}
    </span>
  );
}

/** The tab bar's three styles, each with a small preview. */
export function TabStyleField(props: { settings: SidebarTabsSettings }) {
  return (
    <SegmentedControl
      label="Tab style"
      value={props.settings.style}
      onChange={(style) => void props.settings.setStyle(style)}
      options={SIDEBAR_TAB_STYLES.map((style) => [
        style,
        <span key={style} className="grid justify-items-center gap-1.5">
          <StylePreview style={style} />
          {NAMES[style]}
        </span>,
      ])}
      className="grid grid-cols-3 gap-0.5 [&>button]:px-2 [&>button]:py-2"
    />
  );
}
