import { MesaError } from '@mesa/core';
import { parseDocument, stringify } from 'yaml';
import { defineCommand } from '../command.js';

export const automationsList = defineCommand({
  name: 'automations list',
  summary: 'List optional rules in the active profile; never installs or starts the scheduler',
  example: 'mesa automations list --json',
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
