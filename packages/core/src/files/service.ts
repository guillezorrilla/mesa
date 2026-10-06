import type { MesaContext } from '../context.js';
import { resolveCheckout } from '../projects/checkout.js';
import { fileTree, ignoredFolders, searchFiles } from './browse.js';
import {
  createWorkspaceFile,
  deleteWorkspaceFile,
  readWorkspaceFile,
  renameWorkspaceFile,
  writeWorkspaceFile,
} from './editor.js';
import { openExternalFile } from './external.js';
import { resolveSessionFileLink } from './link.js';

/** Repository file operations share the selected-checkout and checked-path owners. */
export function filesService(ctx: MesaContext) {
  const checkout = (project: string, selected?: string) =>
    resolveCheckout(ctx.open(), ctx.run, project, selected && ctx.absolute(selected));
  return {
    link: (sessionId: string, target: string) => resolveSessionFileLink(ctx, sessionId, target),
    tree: async (project: string, selected?: string) => {
      const at = await checkout(project, selected);
      return fileTree(at, await ignoredFolders(ctx.run, at.path));
    },
    search: async (project: string, query: string, mode: 'name' | 'content', selected?: string) => {
      const at = await checkout(project, selected);
      return searchFiles(at, query, mode, await ignoredFolders(ctx.run, at.path));
    },
    read: async (project: string, path: string, selected?: string, line?: number) =>
      readWorkspaceFile(await checkout(project, selected), path, line),
    open: async (project: string, path: string, selected?: string, line?: number) =>
      ctx.record(
        {
          summary: () => `Opened ${path} in external editor`,
          failure: `Could not open ${path} in external editor`,
          project: () => project,
          inputs: { project, path, checkout: selected, line },
        },
        async () =>
          openExternalFile(
            await checkout(project, selected),
            path,
            line,
            ctx.open().config.editor.external,
            ctx.run,
          ),
      ),
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
