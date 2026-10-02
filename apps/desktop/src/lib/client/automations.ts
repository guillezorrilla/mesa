import type { AutomationRule, AutomationRun, AutomationStatus } from '@mesa/core';
import { command, commandWith } from './spec';

export const automationsCommands = {
  'automations.status': command<AutomationStatus>('automations', 'status'),
  'automations.install': command<AutomationStatus>('automations', 'install'),
  'automations.uninstall': command<AutomationStatus>('automations', 'uninstall'),
  'automations.approve': commandWith<{ id: string }, AutomationRun>(({ id }) => [
    'automations',
    'approve',
    '--',
    id,
  ]),
  'automations.cancel': commandWith<{ id: string }, AutomationRun>(({ id }) => [
    'automations',
    'cancel',
    '--',
    id,
  ]),
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
