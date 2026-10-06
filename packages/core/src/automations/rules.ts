import { existsSync } from 'node:fs';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { changeYaml, readYaml } from '../lib/yaml-file.js';
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
    let result: T | undefined;
    changeYaml(
      file,
      AutomationRulesSchema,
      (rules = []) => {
        result = change(rules);
        return rules;
      },
      ctx,
      'Mesa automations: install the scheduler explicitly to run these rules.',
    );
    return result as T;
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
