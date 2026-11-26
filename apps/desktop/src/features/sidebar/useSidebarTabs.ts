import {
  type SidebarTabId,
  type SidebarTabStyle,
  sidebarTabs,
  withTabOrder,
  withTabShown,
} from '@mesa/core/browser';
import { useCommand, useRun } from '@/lib/useCommand';

export type SidebarTabsSettings = ReturnType<typeof useSidebarTabs>;

/**
 * The sidebar's tab bar settings (`sidebar.tabs`, `sidebar.tabStyle`): every tab in bar order and
 * the style, and their changes, shown by this reader at once and then saved for every reader.
 */
export function useSidebarTabs() {
  const config = useCommand('config.get');
  const run = useRun();
  // Until the config reads, every tab in the default order.
  const tabs = sidebarTabs({
    sidebar: config.data?.sidebar ?? {},
    logs: { cloudTab: config.data?.logs?.cloudTab ?? true },
  });
  const style: SidebarTabStyle = config.data?.sidebar?.tabStyle ?? 'compact';
  const save = async (key: 'tabs' | 'tabStyle', value: unknown) => {
    config.mutate((data) => ({ ...data, sidebar: { ...data.sidebar, [key]: value } }));
    if (await run('config.set', { path: `sidebar.${key}`, value }))
      await config.refreshEverywhere();
    else await config.refresh();
  };
  return {
    tabs,
    style,
    setShown: (id: SidebarTabId, shown: boolean) => save('tabs', withTabShown(tabs, id, shown)),
    /** Puts the optional tabs in `order`, their ids. */
    setOrder: (order: string[]) => save('tabs', withTabOrder(tabs, order)),
    setStyle: (next: SidebarTabStyle) => save('tabStyle', next),
  };
}
