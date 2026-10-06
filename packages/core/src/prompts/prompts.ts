import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { changeJson, readJson } from '../lib/json-file.js';
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
  )
  .describe('saved prompts');
export type SavedPrompt = z.infer<typeof SavedPromptSchema>;
export const parseSavedPrompts = (input: unknown, file: string): SavedPrompt[] =>
  parseWith(ListSchema, input, file);

/** Literal, profile-local saved prompts. Saving never types or sends to an agent. */
export function promptsService(ctx: MesaContext) {
  const file = ctx.paths.prompts;
  const list = (): SavedPrompt[] => {
    ctx.open();
    return readJson(file, ListSchema) ?? [];
  };
  /** Changes the saved list in place under its lock; `change` returns what the caller gets. */
  const update = <T>(change: (prompts: SavedPrompt[]) => T): T => {
    ctx.open();
    let result: T | undefined;
    changeJson(
      file,
      ListSchema,
      (current = []) => {
        result = change(current);
        return current;
      },
      ctx.deps,
    );
    return result as T;
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
        return removed as SavedPrompt;
      }),
  };
}
