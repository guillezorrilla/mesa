import type { AutomationRule } from '@mesa/core';
import { command, commandWith } from './spec';

export const automationsCommands = {
  'automations.list': command<AutomationRule[]>('automations', 'list'),
  'automations.add': commandWith<{ rule: AutomationRule }, AutomationRule>(({ rule }) => [
    'automations',
    'add',
    '--',
    JSON.stringify(rule),
  ]),
  'automations.remove': commandWith<{ name: string }, AutomationRule>(({ name }) => [
    'automations',
    'remove',
    '--',
    name,
  ]),
  'automations.enable': commandWith<{ name: string }, AutomationRule>(({ name }) => [
    'automations',
    'enable',
    '--',
    name,
  ]),
  'automations.disable': commandWith<{ name: string }, AutomationRule>(({ name }) => [
    'automations',
    'disable',
    '--',
    name,
  ]),
};
