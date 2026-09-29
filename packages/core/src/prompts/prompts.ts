import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';

const SavedPromptSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  text: z.string().min(1).max(20_000),
});
const ListSchema = z
  .array(SavedPromptSchema)
  .refine(
    (prompts) =>
      new Set(prompts.map((prompt) => prompt.name.toLocaleLowerCase())).size === prompts.length,
    'saved prompt names must be unique',
  );
export type SavedPrompt = z.infer<typeof SavedPromptSchema>;
export const parseSavedPrompts = (input: unknown, file: string): SavedPrompt[] =>
  parseWith(ListSchema, input, file);

/** Literal, profile-local saved prompts. Saving never types or sends to an agent. */
export function promptsService(ctx: MesaContext) {
  const file = ctx.paths.prompts;
  const list = (): SavedPrompt[] => {
    ctx.open();
    if (!existsSync(file)) return [];
    let input: unknown;
    try {
      input = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new MesaError('invalid_config', `${file}: not valid JSON`);
    }
    return parseSavedPrompts(input, file);
  };
  const write = (prompts: SavedPrompt[]) => writeFileAtomic(file, JSON.stringify(prompts), 0o600);
  const update = <T>(change: (prompts: SavedPrompt[]) => T): T => {
    ctx.open();
    const lock = `${file}.lock`;
    return withLockSync(
      lock,
      () => change(list()),
      () => lockedBy('saved prompts', lock, 'another save'),
    );
  };
  return {
    list,
    save: (name: string, text: string, replace = false): SavedPrompt => {
      const prompt = parseWith(SavedPromptSchema, { name, text }, 'saved prompt');
      return update((prompts) => {
        const index = prompts.findIndex(
          (item) => item.name.toLocaleLowerCase() === prompt.name.toLocaleLowerCase(),
        );
        if (index !== -1 && !replace)
          throw new MesaError('usage', `saved prompt ${prompt.name} already exists`);
        if (index !== -1) prompts[index] = prompt;
        else prompts.push(prompt);
        write(prompts);
        return prompt;
      });
    },
    remove: (name: string): SavedPrompt =>
      update((prompts) => {
        const index = prompts.findIndex(
          (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        );
        if (index === -1) throw new MesaError('not_found', `saved prompt ${name} not found`);
        const [removed] = prompts.splice(index, 1);
        write(prompts);
        return removed as SavedPrompt;
      }),
  };
}
