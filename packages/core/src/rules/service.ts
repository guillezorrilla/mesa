import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import { readWorkspaceFile, writeWorkspaceFile } from '../files/editor.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { ruleInventory } from './inventory.js';

export function rulesService(ctx: MesaContext) {
  const list = (project?: string) =>
    ruleInventory(
      ctx.deps.home,
      project === undefined ? undefined : findProject(ctx.open(), project).path,
    );
  const selected = (id: string, project?: string) => {
    const rule = list(project).find((row) => row.id === id);
    if (!rule) throw new MesaError('not_found', `rule ${id} is unavailable`);
    return {
      rule,
      checkout: { project: project ?? 'global', path: dirname(rule.path), registered: false },
    };
  };
  return {
    list,
    read: (id: string, project?: string) => {
      const { rule, checkout } = selected(id, project);
      return readWorkspaceFile(checkout, rule.name);
    },
    write: (id: string, text: string, revision: string, project?: string) =>
      ctx.record(
        {
          summary: () => `Saved rule ${id}`,
          failure: `Could not save rule ${id}`,
          project: () => project,
          inputs: { id },
        },
        () => {
          const { rule, checkout } = selected(id, project);
          if (!rule.writable)
            throw new MesaError('usage', rule.readOnlyReason ?? 'Rule is read-only');
          return writeWorkspaceFile(checkout, rule.name, text, revision);
        },
      ),
  };
}
