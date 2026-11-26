import { MesaError, sidebarTabs, withTabOrder, withTabShown } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

export const sidebarTabsCommand = defineCommand({
  name: 'sidebar tabs',
  summary:
    "List the app sidebar's tabs in order, whether each shows, and the style (sidebar.tabStyle); --show, --hide or --order the optional ones",
  flags: {
    show: { type: 'string', description: 'Show this tab (reviews, logs)' },
    hide: { type: 'string', description: 'Hide this tab (reviews, logs)' },
    order: {
      type: 'string',
      description: 'The optional tabs in this order, comma-separated (logs,reviews)',
    },
  },
  example: 'mesa sidebar tabs --hide reviews',
  run: ({ mesa, flags }) => {
    const given = [flags.show, flags.hide, flags.order].filter((flag) => flag !== undefined);
    if (given.length > 1) throw new MesaError('usage', 'give one of --show, --hide or --order');
    const tabs = sidebarTabs(mesa.config.get());
    const next =
      flags.order !== undefined
        ? withTabOrder(tabs, flags.order.split(','))
        : flags.show !== undefined
          ? withTabShown(tabs, flags.show, true)
          : flags.hide !== undefined
            ? withTabShown(tabs, flags.hide, false)
            : undefined;
    if (next) mesa.config.set('sidebar.tabs', JSON.stringify(next));
    const config = mesa.config.get();
    const listed = sidebarTabs(config);
    const style = config.sidebar.tabStyle;
    const rows = listed.map((tab) => [
      tab.id,
      tab.shown ? 'shown' : 'hidden',
      tab.fixed ? 'always' : '',
    ]);
    return {
      data: { tabs: listed, style },
      text: [...columns(rows), `style: ${style}`].join('\n'),
    };
  },
});
