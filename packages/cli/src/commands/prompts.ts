import { defineCommand } from '../command.js';

export const prompts = defineCommand({
  name: 'prompts',
  summary: 'List saved prompts in the active profile',
  example: 'mesa prompts',
  run: ({ mesa }) => {
    const data = mesa.prompts.list();
    return { data, text: data.map((prompt) => prompt.name).join('\n') };
  },
});

export const promptsSave = defineCommand({
  name: 'prompts save',
  summary: 'Save a named prompt exactly as supplied; --replace updates an existing name',
  args: ['name', 'text'],
  flags: { replace: { type: 'boolean', description: 'Replace an existing prompt by name' } },
  example: 'mesa prompts save Review "Review the current change"',
  run: ({ mesa, args, flags }) => {
    const data = mesa.prompts.save(args.name, args.text, flags.replace);
    return { data, text: `Saved ${data.name}` };
  },
});

export const promptsRemove = defineCommand({
  name: 'prompts remove',
  summary: 'Remove a named saved prompt from the active profile',
  args: ['name'],
  example: 'mesa prompts remove Review',
  run: ({ mesa, args }) => {
    const { name } = mesa.prompts.remove(args.name);
    return { data: { name }, text: `Removed ${name}` };
  },
});
