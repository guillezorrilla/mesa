// @vitest-environment happy-dom
import type { AutomationRule } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  choose,
  click,
  envelope,
  failure,
  fakeBridge,
  PROJECTS,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { AutomationsScreen } from './AutomationsScreen';

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === label || b.getAttribute('aria-label') === label,
  );
const type = (id: string, value: string) =>
  act(async () => {
    const field = document.getElementById(id) as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });

test('empty rules, form defaults, adding, toggling and confirmed removal use real client commands', async () => {
  let rules: AutomationRule[] = [];
  const { bridge, calls } = fakeBridge({
    'automations list': () => envelope(rules),
    projects: () => envelope(PROJECTS),
    'automations add': (args) => {
      const rule = JSON.parse(args.at(-1) ?? '');
      rules = [rule];
      return envelope(rule);
    },
    'automations disable': () => {
      rules = rules.map((r) => ({ ...r, enabled: false }));
      return envelope(rules[0]);
    },
    'automations enable': () => {
      rules = rules.map((r) => ({ ...r, enabled: true }));
      return envelope(rules[0]);
    },
    'automations remove': () => {
      const rule = rules[0];
      rules = [];
      return envelope(rule);
    },
  });
  const byTestId = await renderWithMesa(<AutomationsScreen />, bridge);
  expect(byTestId('automations-screen')[0]?.textContent).toContain('No automations defined.');
  await click(button('Add automation'));
  await type('automation-name', 'Refresh docs');
  await type('automation-cron', '*/2 * * * *');
  await click(byTestId('automation-add')[0]);
  expect(rules[0]).toMatchObject({
    name: 'Refresh docs',
    when: 'cron',
    cron: '*/2 * * * *',
    run: 'refresh',
    guardrail: 'ask',
    enabled: true,
    notes: false,
    agent: 'claude',
  });
  expect(byTestId('automation-rule-dialog')).toHaveLength(0);
  await click(button('Disable Refresh docs'));
  expect(rules[0]?.enabled).toBe(false);
  await click(button('Enable Refresh docs'));
  expect(rules[0]?.enabled).toBe(true);
  await click(button('Remove'));
  expect(calls.some((c) => c[2] === 'remove')).toBe(false);
  await click(byTestId('automation-remove')[0]);
  expect(rules).toEqual([]);
  expect(calls).toContainEqual(['--json', 'automations', 'remove', '--', 'Refresh docs']);
  expect(calls.some((c) => c.includes('install'))).toBe(false);
});

test('trigger/action controls follow choices, and a failed save keeps fields and shows the error', async () => {
  const { bridge } = fakeBridge({
    'automations list': () => envelope([]),
    projects: () => envelope(PROJECTS),
    'automations add': () => failure('Invalid automation'),
  });
  const byTestId = await renderWithMesa(<AutomationsScreen />, bridge);
  await click(button('Add automation'));
  await type('automation-name', 'New rule');
  await choose(document.getElementById('automation-when') as HTMLSelectElement, 'file');
  expect(document.getElementById('automation-cron')).toBeNull();
  await type('automation-file', 'docs/spec.md');
  await choose(document.getElementById('automation-run') as HTMLSelectElement, 'skill');
  expect(document.getElementById('automation-skill')).not.toBeNull();
  await choose(document.getElementById('automation-run') as HTMLSelectElement, 'send');
  expect(document.getElementById('automation-prompt')).not.toBeNull();
  await choose(document.getElementById('automation-run') as HTMLSelectElement, 'open');
  expect(document.getElementById('automation-goal')).not.toBeNull();
  await choose(document.getElementById('automation-run') as HTMLSelectElement, 'refresh');
  await click(byTestId('automation-add')[0]);
  expect(byTestId('automation-rule-dialog')).toHaveLength(1);
  expect((document.getElementById('automation-name') as HTMLInputElement).value).toBe('New rule');
  expect(toastTexts(byTestId)).toContain('Invalid automation');
  await choose(document.getElementById('automation-when') as HTMLSelectElement, 'state');
  expect(document.getElementById('automation-state')).not.toBeNull();
});

test('install, saved approvals, failure history and uninstall use explicit client commands', async () => {
  let installed = false;
  let pending = true;
  const id = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
  const rule = {
    name: 'Refresh docs',
    project: 'lantern-cove',
    enabled: true,
    when: 'cron',
    cron: '*/2 * * * *',
    run: 'refresh',
    guardrail: 'ask',
  };
  const status = () =>
    envelope({
      installed,
      loaded: installed,
      runs: [
        {
          id,
          rule,
          trigger: { kind: 'cron', at: '2026-10-02T12:00:00Z' },
          status: pending ? 'pending' : 'queued',
          approved: !pending,
        },
        {
          id: `${id.slice(0, -1)}W`,
          rule,
          trigger: { kind: 'cron', at: '2026-10-02T10:00:00Z' },
          status: 'failed',
          reason: 'Source needs reconnect',
          approved: false,
        },
      ],
    });
  const { bridge, calls } = fakeBridge({
    'automations list': () => envelope([rule]),
    'automations status': status,
    'automations install': () => {
      installed = true;
      return status();
    },
    'automations uninstall': () => {
      installed = false;
      return status();
    },
    'automations approve': () => {
      pending = false;
      return envelope({ id, status: 'queued' });
    },
  });
  const byTestId = await renderWithMesa(<AutomationsScreen />, bridge);
  expect(calls.some((c) => c.includes('install'))).toBe(false);
  await click(button('Install scheduler'));
  expect(byTestId('automations-screen')[0]?.textContent).toContain('Scheduler loaded');
  expect(byTestId('automations-screen')[0]?.textContent).toContain('Source needs reconnect');
  await click(button('Approve Refresh docs'));
  expect(calls).toContainEqual(['--json', 'automations', 'approve', '--', id]);
  expect(byTestId('automations-screen')[0]?.textContent).toContain('Refresh docs: queued');
  await click(button('Uninstall scheduler'));
  expect(installed).toBe(false);
});
