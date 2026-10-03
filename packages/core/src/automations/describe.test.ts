import { expect, test } from 'vitest';
import { describeAutomation } from './describe.js';

const base = { name: 'r', project: 'lantern-cove', enabled: true } as const;

test('a rule reads as its trigger, action and guardrail', () => {
  expect(
    describeAutomation({
      ...base,
      when: 'cron',
      cron: '0 9 * * 1-5',
      run: 'skill',
      skill: 'standup',
      guardrail: 'ask',
    }),
  ).toBe('Weekdays at 09:00: run skill standup, asks first');
  expect(
    describeAutomation({
      ...base,
      when: 'file',
      file: 'docs/plan.md',
      run: 'open',
      goal: 'Review the plan',
      agent: 'codex',
      guardrail: 'allow',
    }),
  ).toBe('When docs/plan.md changes: open a session with Codex, runs without asking');
  expect(
    describeAutomation({
      ...base,
      when: 'state',
      state: 'done',
      run: 'send',
      session: 'lantern-cove-1',
      prompt: 'next',
      guardrail: 'ask',
    }),
  ).toBe('When a session becomes done: message session lantern-cove-1, asks first');
});

test('common cron shapes read as words, any other as the expression', () => {
  const when = (cron: string) =>
    describeAutomation({ ...base, when: 'cron', cron, run: 'refresh', guardrail: 'ask' }).replace(
      ': refresh sources, asks first',
      '',
    );
  expect(when('* * * * *')).toBe('Every minute');
  expect(when('*/15 * * * *')).toBe('Every 15 minutes');
  expect(when('30 * * * *')).toBe('Every hour at :30');
  expect(when('5 18 * * *')).toBe('Every day at 18:05');
  expect(when('0 10 * * 0,6')).toBe('Weekends at 10:00');
  expect(when('0 8 * * 1')).toBe('Mondays at 08:00');
  expect(when('0 8 1 * *')).toBe('On cron 0 8 1 * *');
});
