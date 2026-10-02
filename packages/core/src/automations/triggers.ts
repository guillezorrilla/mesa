import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { MesaContext } from '../context.js';
import { checkedFilePath } from '../files/path.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import type { SessionRow } from '../sessions/board/rows.js';
import { cronFields } from './cron.js';
import type { AutomationRule } from './schema.js';
import type { AutomationState, AutomationTrigger } from './state.js';

const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');

/** Latest due minute since the previous observation, coalescing missed cron occurrences. */
function due(expression: string, after: number, until: number): Date | undefined {
  const fields = cronFields(expression);
  let latest: Date | undefined;
  // ponytail: scan missed minutes; use next-occurrence calculation if long outages make this slow.
  for (let at = Math.floor(after / 60_000) * 60_000 + 60_000; at <= until; at += 60_000) {
    const date = new Date(at);
    const values = [
      date.getMinutes(),
      date.getHours(),
      date.getDate(),
      date.getMonth() + 1,
      date.getDay(),
    ];
    const matches = values.map((v, n) => fields[n]?.has(v));
    const [, , day, , weekday] = expression.trim().split(/\s+/);
    const days =
      day === '*' || weekday === '*' ? matches[2] && matches[4] : matches[2] || matches[4];
    if (matches[0] && matches[1] && matches[3] && days) latest = date;
  }
  return latest;
}

/** First file/state observations establish baselines; later observed changes trigger once. */
export function observeRules(
  ctx: MesaContext,
  state: AutomationState,
  rules: AutomationRule[],
  rows: SessionRow[],
) {
  const now = ctx.deps.clock();
  const at = now.toISOString();
  const observed: { rule: AutomationRule; trigger: AutomationTrigger }[] = [];
  for (const rule of rules.filter((r) => r.enabled)) {
    const key = hash(JSON.stringify(rule));
    if (rule.when === 'cron') {
      const after = state.observedAt ? Date.parse(state.observedAt) : now.getTime() - 60_000;
      const occurrence = due(rule.cron as string, after, now.getTime());
      if (occurrence)
        observed.push({ rule, trigger: { kind: 'cron', at, value: occurrence.toISOString() } });
    } else if (rule.when === 'file') {
      const project = findProject(ctx.open(), rule.project);
      let value: string;
      try {
        value = hash(readFileSync(checkedFilePath(project.path, rule.file as string)));
      } catch (error) {
        if (!(error instanceof MesaError) || error.code !== 'not_found') throw error;
        value = 'missing';
      }
      const previous = state.observations[key];
      state.observations[key] = value;
      if (previous !== undefined && value !== previous)
        observed.push({ rule, trigger: { kind: 'file', at, previous, value } });
    } else {
      for (const row of rows.filter(
        (r) => r.managed && r.project === rule.project && r.agent !== 'terminal',
      )) {
        const observation = `${key}:${row.id}`;
        const previous = state.observations[observation];
        const value = row.lastState.state;
        state.observations[observation] = value;
        if (previous !== undefined && previous !== value && value === rule.state) {
          observed.push({
            rule,
            trigger: {
              kind: 'state',
              at,
              session: row.id,
              previous,
              value,
              confidence: row.lastState.confidence,
              source: row.lastState.source,
              ...(row.decision ? { decision: row.decision } : {}),
            },
          });
        }
      }
    }
  }
  state.observedAt = !state.observedAt || at > state.observedAt ? at : state.observedAt;
  return observed;
}
