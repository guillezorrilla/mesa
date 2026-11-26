import { z } from 'zod';
import { MesaError } from '../lib/result.js';

/** The sidebar's tabs in their default order (CONTEXT.md, Sidebar tabs). */
export const SIDEBAR_TABS = ['sessions', 'projects', 'reviews', 'logs'] as const;
export type SidebarTabId = (typeof SIDEBAR_TABS)[number];

/** The tabs that always show, first and in this order. */
const FIXED_TABS: readonly SidebarTabId[] = ['sessions', 'projects'];

export const SIDEBAR_TAB_LABELS: Record<SidebarTabId, string> = {
  sessions: 'Sessions',
  projects: 'Projects',
  reviews: 'Reviews',
  logs: 'Logs',
};

/** How the tab bar shows its tabs, sparest first: one that does not fit gives way to the next. */
export const SIDEBAR_TAB_STYLES = ['labels', 'compact', 'icons'] as const;
export type SidebarTabStyle = (typeof SIDEBAR_TAB_STYLES)[number];

/** The style after `style`, denser; none after icons. */
export const denserTabStyle = (style: SidebarTabStyle): SidebarTabStyle | undefined =>
  SIDEBAR_TAB_STYLES[SIDEBAR_TAB_STYLES.indexOf(style) + 1];

const StoredTabSchema = z.strictObject({ id: z.string(), shown: z.boolean() });
export type StoredSidebarTab = z.infer<typeof StoredTabSchema>;

/** The profile's `sidebar` section: the optional tabs in order with whether each shows, and the style. */
export const SidebarSettingsSchema = z
  .strictObject({
    // Ids as strings: one a newer Mesa adds still loads here, and sidebarTabs drops it.
    tabs: z.array(StoredTabSchema).optional(),
    tabStyle: z.enum(SIDEBAR_TAB_STYLES).default('compact'),
  })
  .prefault({});

export type SidebarTab = { id: SidebarTabId; label: string; shown: boolean; fixed: boolean };

/** What sidebarTabs reads of a config. */
export type SidebarTabsConfig = {
  sidebar: { tabs?: StoredSidebarTab[] };
  logs: { cloudTab: boolean };
};

const isOptional = (id: string): id is SidebarTabId =>
  (SIDEBAR_TABS as readonly string[]).includes(id) && !FIXED_TABS.includes(id as SidebarTabId);

/**
 * Every tab in bar order: Sessions and Projects, always shown, then the optional ones in
 * `sidebar.tabs`' order, an unknown or repeated id dropped and a missing one after them in the
 * default order. Logs, until `sidebar.tabs` names it, shows as the retired `logs.cloudTab` says.
 */
export function sidebarTabs(config: SidebarTabsConfig): SidebarTab[] {
  const stored = (config.sidebar.tabs ?? []).filter(
    (tab, at, all) => isOptional(tab.id) && all.findIndex((each) => each.id === tab.id) === at,
  );
  const missing = SIDEBAR_TABS.filter(
    (id) => isOptional(id) && !stored.some((tab) => tab.id === id),
  ).map((id) => ({ id, shown: id === 'logs' ? config.logs.cloudTab : true }));
  const tab = (id: SidebarTabId, shown: boolean, fixed: boolean): SidebarTab => ({
    id,
    label: SIDEBAR_TAB_LABELS[id],
    shown,
    fixed,
  });
  return [
    ...FIXED_TABS.map((id) => tab(id, true, true)),
    ...[...stored, ...missing].map((each) => tab(each.id as SidebarTabId, each.shown, false)),
  ];
}

/** The `sidebar.tabs` value `tabs` stand for: the optional ones, in order. */
const stored = (tabs: readonly SidebarTab[]): StoredSidebarTab[] =>
  tabs.filter((tab) => !tab.fixed).map(({ id, shown }) => ({ id, shown }));

/** The `sidebar.tabs` value with tab `id` shown or hidden; a usage error for a fixed or unknown one. */
export function withTabShown(
  tabs: readonly SidebarTab[],
  id: string,
  shown: boolean,
): StoredSidebarTab[] {
  const tab = tabs.find((each) => each.id === id);
  if (!tab) {
    const optional = tabs.filter((each) => !each.fixed).map((each) => each.id);
    throw new MesaError(
      'usage',
      `no sidebar tab ${id}; the optional ones are ${optional.join(', ')}`,
    );
  }
  if (tab.fixed) throw new MesaError('usage', `${tab.label} always shows`);
  return stored(tabs.map((each) => (each.id === id ? { ...each, shown } : each)));
}

/** The `sidebar.tabs` value with the optional tabs in `order` (their ids); one it leaves out keeps its place after. */
export function withTabOrder(
  tabs: readonly SidebarTab[],
  order: readonly string[],
): StoredSidebarTab[] {
  const rank = (tab: SidebarTab) => {
    const at = order.indexOf(tab.id);
    return at < 0 ? order.length : at;
  };
  return stored([...tabs].sort((a, b) => rank(a) - rank(b)));
}
