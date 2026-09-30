import {
  DEFAULT_VAULT_SEARCH_LIMIT,
  EXIT_CODES,
  MesaError,
  type Recorded,
  type Saved,
  VAULT_CATEGORIES,
  VAULT_KINDS,
  type VaultRead,
} from '@mesa/core';
import { defineCommand } from '../command.js';
import { decimal, wholeNumber } from '../guards.js';
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

export const vaultSearch = defineCommand({
  name: 'vault search',
  summary: 'Find the vault items with every word in them: paths, notes, canvases, and bases',
  args: ['words...'],
  flags: {
    project: { type: 'string', description: 'Only the items of this project' },
    type: {
      type: 'string',
      description: `Only one kind (${VAULT_KINDS.join(', ')}) or category (${VAULT_CATEGORIES.join(', ')})`,
    },
    limit: {
      type: 'string',
      description: `How many to list (default ${DEFAULT_VAULT_SEARCH_LIMIT})`,
    },
  },
  example: 'mesa vault search harbour lights --project tide',
  run: ({ mesa, args, flags }) => {
    const found = mesa.vault.search(args.words.join(' '), {
      project: flags.project,
      type: flags.type,
      limit: flags.limit === undefined ? undefined : wholeNumber(flags.limit, '--limit'),
    });
    const lines = found.items.flatMap((hit) => [
      `${hit.path} (${hit.kind})`,
      ...hit.matches.map((match) => `  ${match.line}: ${match.text}`),
    ]);
    const count = `${found.total} ${found.total === 1 ? 'item' : 'items'}`;
    const said = found.truncated ? `${found.items.length} of ${count}` : count;
    return { data: found, text: [...lines, said].join('\n') };
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

// The session writes (CONTEXT.md, Session write): each prints {path, changed, receipt}.

/** What a save prints: where it landed, and whether it changed the note. */
function savedOutput(recorded: Recorded<Saved>) {
  const { path, changed } = recorded.result;
  const text = changed ? `saved ${path}` : `${path} unchanged`;
  return recordedOutput(recorded, { data: { path, changed }, text });
}

/** `--probability <option>=<p>` words as {option: p}; core checks each p is from 0 to 1. */
function probabilitiesOf(words: string[]): Record<string, number> {
  const odds: Record<string, number> = {};
  for (const word of words) {
    const at = word.lastIndexOf('=');
    if (at <= 0) throw new MesaError('usage', `--probability takes <option>=<p>, not ${word}`);
    const option = word.slice(0, at);
    if (Object.hasOwn(odds, option)) {
      throw new MesaError('usage', `--probability names ${option} twice`);
    }
    odds[option] = decimal(word.slice(at + 1), `--probability ${option}`);
  }
  return odds;
}

const session = {
  type: 'string',
  description:
    'The Mesa session it is from (default: the Mesa window this runs in, on the project)',
} as const;

/** A save's text, given or in a file. */
const textFlags = (what: string) =>
  ({
    text: { type: 'string', description: `The ${what}` },
    file: { type: 'string', description: `A file holding the ${what}` },
  }) as const;

export const vaultSaveDecision = defineCommand({
  name: 'vault save decision',
  summary:
    'Save a decision and its rationale in wiki/decisions/, with one decision receipt; the same save again adds nothing',
  flags: {
    project: { type: 'string', required: true, description: 'The registered project it is for' },
    title: {
      type: 'string',
      required: true,
      description: 'A short name; the note is wiki/decisions/<YYYY-MM-DD>-<its slug>.md',
    },
    decision: { type: 'string', required: true, description: 'What was decided' },
    rationale: { type: 'string', required: true, description: 'Why it was decided' },
    probability: {
      type: 'string',
      multiple: true,
      description:
        "Faro's probability of one option, <option>=<p>, from mesa decide; once per option",
    },
    confidence: { type: 'string', description: "Faro's confidence, from 0 to 1, from mesa decide" },
    session,
  },
  example:
    'mesa vault save decision --project lantern-cove --title "Fixed clock in tide tests" --decision "Tests take the clock as a parameter" --rationale "The flake was the wall clock at midnight" --probability fixed-clock=0.8 --probability retry=0.2 --confidence 0.8',
  run: async ({ mesa, flags }) =>
    savedOutput(
      await mesa.vault.saveDecision({
        project: flags.project,
        session: flags.session,
        title: flags.title,
        decision: flags.decision,
        rationale: flags.rationale,
        ...(flags.probability ? { probabilities: probabilitiesOf(flags.probability) } : {}),
        ...(flags.confidence === undefined
          ? {}
          : { confidence: decimal(flags.confidence, '--confidence') }),
      }),
    ),
});

export const vaultSaveNote = defineCommand({
  name: 'vault save note',
  summary:
    'Save a note in wiki/notes/, or at --path under wiki/ or projects/<project>/, with one vault-change receipt when it changed',
  flags: {
    title: { type: 'string', required: true, description: 'Its title; names wiki/notes/<slug>.md' },
    ...textFlags('note'),
    path: {
      type: 'string',
      description: 'Where it goes instead, under wiki/ or projects/<project>/',
    },
    project: { type: 'string', description: 'The registered project it belongs to' },
    session,
  },
  example:
    'mesa vault save note --project lantern-cove --title "Tide table sources" --file tide-sources.md',
  run: async ({ mesa, flags }) =>
    savedOutput(
      await mesa.vault.saveNote({
        title: flags.title,
        body: flags.text,
        file: flags.file,
        path: flags.path,
        project: flags.project,
        session: flags.session,
      }),
    ),
});

export const vaultSaveSummary = defineCommand({
  name: 'vault save summary',
  summary:
    "Save a session's summary as wiki/sessions/<id>.md, with one vault-change receipt when it changed",
  flags: {
    session: { type: 'string', required: true, description: 'The Mesa session it summarises' },
    ...textFlags('summary'),
  },
  example: 'mesa vault save summary --session a1b2c3d4 --file summary.md',
  run: async ({ mesa, flags }) =>
    savedOutput(
      await mesa.vault.saveSummary({
        session: flags.session,
        summary: flags.text,
        file: flags.file,
      }),
    ),
});
