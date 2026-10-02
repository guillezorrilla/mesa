import { existsSync } from 'node:fs';
import type { MesaContext } from '../context.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { readYaml, writeYaml } from '../lib/yaml-file.js';
import { findProject } from '../projects/projects.js';
import { type AutomationRule, AutomationRuleSchema, AutomationRulesSchema } from './schema.js';

/** Inert rule management: storage never starts sessions or installs a scheduler. */
export function automationRules(ctx: MesaContext) {
  const file = ctx.paths.automations;
  const list = (): AutomationRule[] => {
    ctx.open();
    return existsSync(file) ? readYaml(file, AutomationRulesSchema) : [];
  };
  const update = <T>(change: (rules: AutomationRule[]) => T): T => {
    ctx.open();
    const lock = `${file}.lock`;
    return withLockSync(
      lock,
      () => {
        const rules = list();
        const result = change(rules);
        writeYaml(file, rules, {
          mode: 0o600,
          header: 'Mesa automations: install the scheduler explicitly to run these rules.',
        });
        return result;
      },
      () => lockedBy('automations', lock, 'another rule edit'),
    );
  };
  const indexOf = (rules: AutomationRule[], name: string) => {
    const at = rules.findIndex((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (at < 0) throw new MesaError('not_found', `no automation ${name}`);
    return at;
  };
  return {
    list,
    add: (input: unknown) => {
      const rule = parseWith(AutomationRuleSchema, input, 'automation');
      findProject(ctx.open(), rule.project);
      return update((rules) => {
        if (rules.some((r) => r.name.toLowerCase() === rule.name.toLowerCase()))
          throw new MesaError('usage', `automation ${rule.name} already exists`);
        rules.push(rule);
        return rule;
      });
    },
    remove: (name: string) =>
      update((rules) => rules.splice(indexOf(rules, name), 1)[0] as AutomationRule),
    setEnabled: (name: string, enabled: boolean) =>
      update((rules) => {
        const rule = rules[indexOf(rules, name)] as AutomationRule;
        rule.enabled = enabled;
        return rule;
      }),
  };
}
