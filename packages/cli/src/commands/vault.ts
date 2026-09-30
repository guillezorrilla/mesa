import { EXIT_CODES, VAULT_CATEGORIES, VAULT_KINDS, type VaultRead } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';
import { recordedOutput } from '../output/recorded.js';

export const vaultInit = defineCommand({
  name: 'vault init',
  summary: 'Lay out the profile vault; only what is missing is created',
  flags: {
    force: { type: 'boolean', description: 'Lay out a folder that is not empty and not a vault' },
  },
  example: 'mesa vault init',
  run: ({ mesa, flags }) => {
    const recorded = mesa.vault.init(flags.force ?? false);
    const { path, created } = recorded.result;
    const said = created.length
      ? `created ${created.join(', ')} in ${path}`
      : 'vault already initialised';
    return recordedOutput(recorded, { data: { path, created }, text: said });
  },
});

export const vaultStatus = defineCommand({
  name: 'vault status',
  summary: 'Check that the profile vault has its layout',
  example: 'mesa vault status',
  run: ({ mesa }) => {
    const status = mesa.vault.status();
    const text = status.ok
      ? `vault ok: ${status.path}`
      : `vault ${status.path} is missing: ${status.missing.join(', ')}`;
    return { data: status, text, code: status.ok ? 0 : EXIT_CODES.not_found };
  },
});

export const vaultList = defineCommand({
  name: 'vault list',
  summary: 'List every item in the profile vault, its internals aside',
  flags: {
    project: { type: 'string', description: 'Only the items of this project' },
    type: {
      type: 'string',
      description: `Only one kind (${VAULT_KINDS.join(', ')}) or category (${VAULT_CATEGORIES.join(', ')})`,
    },
  },
  example: 'mesa vault list --type receipts',
  run: ({ mesa, flags }) => {
    const inventory = mesa.vault.list({ project: flags.project, type: flags.type });
    const rows = columns(
      inventory.items.map((i) => [
        i.kind,
        i.category,
        i.project ?? '-',
        i.unavailable ? `${i.path} (${i.unavailable})` : i.path,
      ]),
    );
    const said = `${inventory.total} ${inventory.total === 1 ? 'item' : 'items'} in ${inventory.vault}`;
    return { data: inventory, text: [...rows, said].join('\n') };
  },
});

/** What `mesa vault read` prints without --json: the preview, then the links and backlinks. */
function readText(read: VaultRead): string {
  const lines = [`${read.path} (${read.kind})`];
  if (read.preview === 'markdown') {
    const properties = Object.entries(read.frontmatter).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]);
    lines.push(...columns(properties), '', read.body.trimEnd(), '');
    lines.push(read.links.length ? 'links:' : 'links: none');
    lines.push(
      ...columns(
        read.links.map((link) => [
          link.status,
          link.text,
          link.status === 'resolved'
            ? link.path
            : link.status === 'ambiguous'
              ? link.candidates.join(', ')
              : '',
        ]),
        '  ',
      ),
    );
  } else if (read.preview === 'canvas') {
    lines.push(`${read.nodes} nodes, ${read.edges} edges`, ...read.texts.map((t) => `- ${t}`));
  } else if (read.preview === 'base') {
    lines.push(read.yaml.trimEnd());
  } else {
    lines.push(`preview not available: ${read.reason}`);
  }
  lines.push(read.backlinks.length ? 'backlinks:' : 'backlinks: none');
  lines.push(...read.backlinks.map((path) => `  ${path}`), `open: ${read.uri}`);
  return lines.join('\n');
}

export const vaultRead = defineCommand({
  name: 'vault read',
  summary: 'Read one vault item: a note with its properties, links, and backlinks, or its preview',
  args: ['path'],
  example: 'mesa vault read wiki/harbour-lights.md',
  run: ({ mesa, args }) => {
    const read = mesa.vault.read(args.path);
    return { data: read, text: readText(read) };
  },
});

export const vaultOpen = defineCommand({
  name: 'vault open',
  summary: 'Open the vault, or one item in it, in Obsidian',
  args: ['note?'],
  flags: {
    cli: { type: 'boolean', description: 'Use the Obsidian CLI for a note when it is registered' },
  },
  example: 'mesa vault open daily/2026-09-25',
  run: async ({ mesa, args, flags }) => {
    const { opened, method, target } = await mesa.vault.open(args.note, flags.cli ?? false);
    return { data: { opened, method, target }, text: `opened ${target} (${method})` };
  },
});
