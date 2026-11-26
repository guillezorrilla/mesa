import { MesaError, sidebarTabs, withTabShown } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const sidebarTabsCommand = defineCommand({
  name: 'sidebar tabs',
  summary:
    "List the app sidebar's tabs in order, whether each shows, and the style (sidebar.tabStyle); --show or --hide an optional one",
  flags: {
    show: { type: 'string', description: 'Show this tab (reviews, logs)' },
    hide: { type: 'string', description: 'Hide this tab (reviews, logs)' },
  },
  example: 'mesa sidebar tabs --hide reviews',
  run: ({ mesa, flags }) => {
    if (flags.show !== undefined && flags.hide !== undefined)
      throw new MesaError('usage', 'give --show or --hide, not both');
    const id = flags.show ?? flags.hide;
    if (id !== undefined) {
      const tabs = withTabShown(sidebarTabs(mesa.config.get()), id, flags.show !== undefined);
      mesa.config.set('sidebar.tabs', JSON.stringify(tabs));
    }
    const config = mesa.config.get();
    const tabs = sidebarTabs(config);
    const style = config.sidebar.tabStyle;
    const rows = tabs.map((tab) => [
      tab.id,
      tab.shown ? 'shown' : 'hidden',
      tab.fixed ? 'always' : '',
    ]);
    return { data: { tabs, style }, text: [...columns(rows), `style: ${style}`].join('\n') };
  },
});
