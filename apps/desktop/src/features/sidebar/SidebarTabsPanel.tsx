import type { SidebarTabStyle } from '@mesa/core/browser';
import { SectionLabel } from '@/components/SectionLabel';
import { SidebarTabsField } from './SidebarTabsField';
import { TabStyleField } from './TabStyleField';
import type { SidebarTabsSettings } from './useSidebarTabs';

/**
 * The tab bar's controls: which tabs show and in what order, and its style. The tab bar's
 * Customize tabs popover and Settings > Appearance > Sidebar show it.
 */
export function SidebarTabsPanel(props: {
  settings: SidebarTabsSettings;
  /** The style the tab bar draws, when it is beside it (useFittingTabStyle). */
  shown?: SidebarTabStyle;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <SectionLabel>Tabs</SectionLabel>
        <SidebarTabsField settings={props.settings} />
      </div>
      <div className="grid gap-1.5">
        <SectionLabel>Style</SectionLabel>
        <TabStyleField settings={props.settings} shown={props.shown} />
      </div>
    </div>
  );
}
