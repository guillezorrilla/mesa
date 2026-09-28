import type { MesaContext } from '../context.js';
import { resolveCheckout } from '../git/checkout.js';
import { fileTree, searchFiles } from './browse.js';
import {
  createWorkspaceFile,
  deleteWorkspaceFile,
  readWorkspaceFile,
  renameWorkspaceFile,
  writeWorkspaceFile,
} from './editor.js';

/** Repository file operations share the selected-checkout and checked-path owners. */
export function filesService(ctx: MesaContext) {
  const checkout = (project: string, selected?: string) =>
    resolveCheckout(ctx.open(), ctx.deps.run, project, selected && ctx.absolute(selected));
  return {
    tree: async (project: string, selected?: string) => fileTree(await checkout(project, selected)),
    search: async (project: string, query: string, mode: 'name' | 'content', selected?: string) =>
      searchFiles(await checkout(project, selected), query, mode),
    read: async (project: string, path: string, selected?: string, line?: number) =>
      readWorkspaceFile(await checkout(project, selected), path, line),
    write: async (
      project: string,
      path: string,
      text: string,
      revision: string,
      selected?: string,
    ) =>
      ctx.record(
        {
          summary: () => `Saved ${path} in ${project}`,
          failure: `Could not save ${path} in ${project}`,
          project: () => project,
          inputs: { project, path, checkout: selected },
        },
        async () => writeWorkspaceFile(await checkout(project, selected), path, text, revision),
      ),
    create: async (project: string, path: string, text = '', selected?: string) =>
      ctx.record(
        {
          summary: () => `Created ${path} in ${project}`,
          failure: `Could not create ${path} in ${project}`,
          project: () => project,
          inputs: { project, path, checkout: selected },
        },
        async () => createWorkspaceFile(await checkout(project, selected), path, text),
      ),
    rename: async (
      project: string,
      from: string,
      path: string,
      revision: string,
      selected?: string,
    ) =>
      ctx.record(
        {
          summary: () => `Renamed ${from} to ${path} in ${project}`,
          failure: `Could not rename ${from} in ${project}`,
          project: () => project,
          inputs: { project, from, path, checkout: selected },
        },
        async () => renameWorkspaceFile(await checkout(project, selected), from, path, revision),
      ),
    delete: async (project: string, path: string, revision: string, selected?: string) =>
      ctx.record(
        {
          summary: () => `Deleted ${path} in ${project}`,
          failure: `Could not delete ${path} in ${project}`,
          project: () => project,
          inputs: { project, path, checkout: selected },
        },
        async () => deleteWorkspaceFile(await checkout(project, selected), path, revision),
      ),
  };
}
