import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import { readWorkspaceFile, writeWorkspaceFile } from '../files/editor.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { instructionInventory } from './inventory.js';

export function instructionsService(ctx: MesaContext) {
  const list = (project?: string) =>
    instructionInventory(
      ctx.home,
      ctx.env,
      project === undefined ? undefined : findProject(ctx.open(), project).path,
    );
  const selected = (id: string, project?: string) => {
    const file = list(project).find((row) => row.id === id);
    if (!file) throw new MesaError('not_found', `instruction file ${id} is unavailable`);
    return {
      file,
      checkout: { project: project ?? 'global', path: dirname(file.path), registered: false },
    };
  };
  return {
    list,
    read: (id: string, project?: string) => {
      const { file, checkout } = selected(id, project);
      return readWorkspaceFile(checkout, file.name);
    },
    write: (id: string, text: string, revision: string, project?: string) =>
      ctx.record(
        {
          summary: () => `Saved instruction file ${id}`,
          failure: `Could not save instruction file ${id}`,
          project: () => project,
          inputs: { id },
        },
        () => {
          const { file, checkout } = selected(id, project);
          if (!file.writable)
            throw new MesaError('usage', file.readOnlyReason ?? 'Instruction file is read-only');
          return writeWorkspaceFile(checkout, file.name, text, revision);
        },
      ),
  };
}
