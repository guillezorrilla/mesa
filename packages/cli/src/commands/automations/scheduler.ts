import { stringify } from 'yaml';
import { defineCommand } from '../../command.js';

export const automationsInstall = defineCommand({
  name: 'automations install',
  summary: "Explicitly install this profile's GUI LaunchAgent",
  example: 'mesa automations install',
  run: async ({ mesa }) => ({
    data: await mesa.automations.install(),
    text: 'Scheduler installed.',
  }),
});

export const automationsUninstall = defineCommand({
  name: 'automations uninstall',
  summary: "Unload this profile's scheduler and stop its owned work",
  example: 'mesa automations uninstall',
  run: async ({ mesa }) => ({
    data: await mesa.automations.uninstall(),
    text: 'Scheduler uninstalled.',
  }),
});

export const automationsStatus = defineCommand({
  name: 'automations status',
  summary: 'Show installation, waiting approvals and run history',
  example: 'mesa automations status',
  run: async ({ mesa }) => {
    const data = await mesa.automations.status();
    return { data, text: stringify(data).trimEnd() };
  },
});

export const automationsTick = defineCommand({
  name: 'automations tick',
  summary: 'Observe rules and dispatch queued work serially',
  example: 'mesa automations tick',
  run: async ({ mesa }) => {
    const data = await mesa.automations.tick();
    return { data, text: stringify(data).trimEnd() };
  },
});
