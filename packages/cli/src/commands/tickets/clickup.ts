import { defineCommand } from '../../command.js';

export const ticketsLocations = defineCommand({
  name: 'tickets locations',
  summary: "List ClickUp's Spaces, Folders and Lists, which a ClickUp view follows",
  example: 'mesa tickets locations',
  run: async ({ mesa }) => {
    const data = await mesa.tickets.locations();
    const lines = data.workspaces.flatMap((w) => [
      `${w.name} (${w.id})`,
      ...w.spaces.flatMap((s) => [
        `  Space ${s.name} (${s.id})`,
        ...s.folders.flatMap((f) => [
          `    Folder ${f.name} (${f.id})`,
          ...f.lists.map((l) => `      List ${l.name} (${l.id})`),
        ]),
        ...s.lists.map((l) => `    List ${l.name} (${l.id})`),
      ]),
    ]);
    return { data, text: lines.join('\n') || 'No ClickUp Workspaces.' };
  },
});

export const ticketsSavedViews = defineCommand({
  name: 'tickets saved-views',
  summary: "List ClickUp's saved task views at Everything and in each Space",
  example: 'mesa tickets saved-views',
  run: async ({ mesa }) => {
    const data = await mesa.tickets.savedViews();
    const lines = data.views.map((v) => `${v.name}: ${v.type} in ${v.where} (${v.id})`);
    return { data, text: lines.join('\n') || 'No saved ClickUp views.' };
  },
});
