import { type KeyRow, localDay, type Placed } from '@mesa/core';
import { defineCommand } from '../command.js';
import { columns } from '../output/columns.js';

const LABELS: Record<KeyRow['provider'], string> = {
  typesafe: 'TypeSafe key',
  cloudflare: 'Cloudflare API token',
};

/** One key's line: only its last 4 characters and the day it was added. */
const line = (row: KeyRow) =>
  row.set
    ? [
        row.provider,
        `set, ending in ${row.last4}`,
        row.addedAt && `added ${localDay(new Date(row.addedAt))}`,
      ]
    : [row.provider, 'not set'];

export const decisionsKeySet = defineCommand({
  name: 'decisions key set',
  summary:
    "Test and save a decision model's key in the Keychain: typesafe (Jev) or cloudflare (CLEF); the key comes from a hidden prompt, or stdin, never an argument",
  args: ['provider'],
  flags: {
    account: {
      type: 'string',
      description: 'The Cloudflare account ID, for a cloudflare token; kept in config.yaml',
    },
  },
  example: 'printf %s "$CLOUDFLARE_API_TOKEN" | mesa decisions key set cloudflare --account <id>',
  run: async ({ mesa, args, flags, stdin, askSecret }) => {
    const label = LABELS[args.provider as KeyRow['provider']] ?? 'key';
    const value = askSecret ? await askSecret(`${label}: `) : await stdin();
    const saved = await mesa.decisions.keys.set(
      args.provider,
      value,
      flags.account ? { account: flags.account } : {},
    );
    return {
      data: saved,
      text: [...columns([line(saved.key)]), `model ${saved.model}`].join('\n'),
    };
  },
});

export const decisionsKeyList = defineCommand({
  name: 'decisions key list',
  summary: "List the decision models' keys: whether each is set, its last 4 characters, when added",
  example: 'mesa decisions key list',
  run: async ({ mesa }) => {
    const keys = await mesa.decisions.keys.list();
    const { model } = mesa.config.get().decisions;
    return { data: { keys }, text: [...columns(keys.map(line)), `model ${model}`].join('\n') };
  },
});

export const decisionsKeyRemove = defineCommand({
  name: 'decisions key remove',
  summary:
    "Delete a decision model's key from the Keychain; if its model was in use, the other model takes over when it has a key",
  args: ['provider'],
  example: 'mesa decisions key remove typesafe',
  run: async ({ mesa, args }) => {
    const data = await mesa.decisions.keys.remove(args.provider);
    const done = data.removed ? `removed ${data.provider}` : `${data.provider} was not set`;
    return { data, text: `${done}\nmodel ${data.model}` };
  },
});

export const decisionsUse = defineCommand({
  name: 'decisions use',
  summary:
    'Choose the model Faro asks when its rules are unsure: jev or clef (its key must be set), or none for the rules alone',
  args: ['model'],
  example: 'mesa decisions use clef',
  run: async ({ mesa, args }) => {
    const data = await mesa.decisions.use(args.model);
    return { data, text: `model ${data.model}` };
  },
});

export const decisionsPlace = defineCommand({
  name: 'decisions place',
  summary:
    'Ask the chosen model, if it passed the supervision gate, to place the sessions the Board is unsure of (no hook, no listing) from their screens; each reply is saved for the next mesa sessions. Run beside the Board read: nothing waits on it',
  example: 'mesa decisions place',
  run: async ({ mesa }) => {
    const placed = await mesa.decisions.place();
    const line = (p: Placed) =>
      'dropped' in p
        ? [p.id, `dropped: ${p.dropped}`]
        : [
            p.id,
            p.saved.placed
              ? `${p.saved.placed.state} (${p.saved.placed.source})`
              : `rules: ${p.saved.ask.fallbackReason ?? ''}`,
          ];
    return {
      data: { placed },
      text: placed.length ? columns(placed.map(line)).join('\n') : 'nothing to place',
    };
  },
});
