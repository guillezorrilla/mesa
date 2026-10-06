import { MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

export const filesRead = defineCommand({
  name: 'files read',
  summary: 'Read a UTF-8 file with its revision',
  args: ['project', 'path'],
  flags: {
    checkout: CHECKOUT_FLAG,
    line: { type: 'string', description: 'Exact one-based line target' },
  },
  example: 'mesa files read lantern-cove README.md --line 1',
  run: async ({ mesa, args, flags }) => {
    const line = flags.line === undefined ? undefined : Number(flags.line);
    if (line !== undefined && (!Number.isSafeInteger(line) || line < 1))
      throw new MesaError('usage', 'line must be a positive integer');
    const data = await mesa.files.read(args.project, args.path, flags.checkout, line);
    return { data, text: data.text };
  },
});

export const filesOpen = defineCommand({
  name: 'files open',
  summary: 'Open a checked file in the configured external editor',
  args: ['project', 'path'],
  flags: {
    checkout: CHECKOUT_FLAG,
    line: { type: 'string', description: 'Exact one-based line target' },
  },
  example: 'mesa files open lantern-cove README.md --line 1',
  run: async ({ mesa, args, flags }) => {
    const line = flags.line === undefined ? undefined : Number(flags.line);
    if (line !== undefined && (!Number.isSafeInteger(line) || line < 1))
      throw new MesaError('usage', 'line must be a positive integer');
    const recorded = await mesa.files.open(args.project, args.path, flags.checkout, line);
    return recordedOutput(recorded, { data: recorded.result, text: `opened ${args.path}` });
  },
});
