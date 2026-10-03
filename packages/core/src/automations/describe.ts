import { AGENT_LABELS } from '../agents/names.js';
import type { AutomationRule } from './schema.js';

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const WEEKDAYS: Record<string, string> = { '*': 'Every day', '1-5': 'Weekdays', '0,6': 'Weekends' };
const two = (n: string) => n.padStart(2, '0');

/**
 * A cron schedule in words for its common shapes: every minute or N minutes, hourly, or a daily
 * time on every day, weekdays, weekends or one weekday.
 * ponytail: any other shape reads as its expression; add a shape when rules use it.
 */
function cronWords(expression: string) {
  const [minute = '', hour = '', day, month, weekday = ''] = expression.trim().split(/\s+/);
  const number = /^\d+$/;
  if (day === '*' && month === '*') {
    if (hour === '*' && weekday === '*') {
      if (minute === '*') return 'Every minute';
      if (/^\*\/\d+$/.test(minute)) return `Every ${minute.slice(2)} minutes`;
      if (number.test(minute)) return `Every hour at :${two(minute)}`;
    }
    const days =
      WEEKDAYS[weekday] ?? (number.test(weekday) ? DAYS[Number(weekday) % 7] : undefined);
    if (days && number.test(minute) && number.test(hour))
      return `${days} at ${two(hour)}:${two(minute)}`;
  }
  return `On cron ${expression}`;
}

/** A rule as one sentence: when it fires, what it does, and whether it asks first. */
export function describeAutomation(rule: AutomationRule): string {
  const when =
    rule.when === 'cron'
      ? cronWords(rule.cron ?? '')
      : rule.when === 'file'
        ? `When ${rule.file} changes`
        : `When a session becomes ${rule.state}`;
  const action = {
    skill: `run skill ${rule.skill}`,
    send: `message session ${rule.session}`,
    open: 'open a session',
    refresh: 'refresh sources',
  }[rule.run];
  const agent = rule.agent ? ` with ${AGENT_LABELS[rule.agent]}` : '';
  const guardrail = rule.guardrail === 'ask' ? 'asks first' : 'runs without asking';
  return `${when}: ${action}${agent}, ${guardrail}`;
}
