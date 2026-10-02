import { MesaError } from '@mesa/core';
import { parseDocument, stringify } from 'yaml';
import { defineCommand } from '../command.js';

export const automationsList = defineCommand({
  name: 'automations list',
  summary: 'List optional rules in the active profile; never installs or starts the scheduler',
  example: 'mesa automations list',
  run: ({ mesa }) => {
    const data = mesa.automations.list();
    return { data, text: data.length ? stringify(data).trimEnd() : 'No automations.' };
  },
});

export const automationsAdd = defineCommand({
  name: 'automations add',
  summary: 'Add one rule supplied as YAML or JSON; rule management does not install the scheduler',
  args: ['definition'],
  example:
    'mesa automations add "{name: refresh-docs, project: lantern-cove, when: cron, cron: \'*/2 * * * *\', run: refresh, guardrail: ask}"',
  run: ({ mesa, args }) => {
    const doc = parseDocument(args.definition);
    if (doc.errors.length) throw new MesaError('usage', 'automation definition is not valid YAML');
    const data = mesa.automations.add(doc.toJS());
    return { data, text: `Added ${data.name}; install the scheduler explicitly to run rules.` };
  },
});

export const automationsRemove = defineCommand({
  name: 'automations remove',
  summary: 'Remove a rule from the active profile',
  args: ['name'],
  example: 'mesa automations remove refresh-docs',
  run: ({ mesa, args }) => {
    const data = mesa.automations.remove(args.name);
    return { data, text: `Removed ${data.name}` };
  },
});

export const automationsEnable = defineCommand({
  name: 'automations enable',
  summary: 'Enable a rule; does not install the scheduler',
  args: ['name'],
  example: 'mesa automations enable refresh-docs',
  run: ({ mesa, args }) => {
    const data = mesa.automations.setEnabled(args.name, true);
    return { data, text: `Enabled ${data.name}` };
  },
});

export const automationsDisable = defineCommand({
  name: 'automations disable',
  summary: 'Disable a rule in the active profile',
  args: ['name'],
  example: 'mesa automations disable refresh-docs',
  run: ({ mesa, args }) => {
    const data = mesa.automations.setEnabled(args.name, false);
    return { data, text: `Disabled ${data.name}` };
  },
});

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
export const automationsApprove = defineCommand({
  name: 'automations approve',
  summary: 'Approve one saved pending run; never overrides a block',
  args: ['id'],
  example: 'mesa automations approve 01ARZ3NDEKTSV4RRFFQ69G5FAV',
  run: ({ mesa, args }) => ({
    data: mesa.automations.approve(args.id),
    text: 'Run approved for the next tick.',
  }),
});
export const automationsCancel = defineCommand({
  name: 'automations cancel',
  summary: 'Cancel one pending or queued run',
  args: ['id'],
  example: 'mesa automations cancel 01ARZ3NDEKTSV4RRFFQ69G5FAV',
  run: ({ mesa, args }) => ({ data: mesa.automations.cancel(args.id), text: 'Run cancelled.' }),
});
