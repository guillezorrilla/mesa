import { z } from 'zod';
import { htmlToMarkdown } from '../lib/html-markdown.js';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { confluenceApi, readItem, siteOf } from './atlassian.js';
import type { Item, ItemRef } from './items.js';

const revisionSchema = z.object({
  version: z.object({ number: z.number().int().positive() }).optional(),
});
const pageSchema = revisionSchema.extend({
  title: z.string(),
  parentId: z.string().nullish(),
  parentType: z.string().nullish(),
  body: z.object({ view: z.object({ value: z.string() }).nullish() }).nullish(),
});

/** How far up the page tree the ancestors go. */
const DEPTH = 10;

/**
 * A Confluence page as an item: its title, its ancestors' titles, and its body as Markdown.
 * Ancestors come from each page's `parentId` (the ancestors endpoint needs a scope real tokens
 * lack), up to DEPTH pages, and stop at a parent that is not a page or that the person cannot see.
 * Reads only.
 */
export async function confluencePage(
  get: Http,
  ref: ItemRef,
  previousRevision?: string,
): Promise<Item | undefined> {
  const api = confluenceApi(siteOf(ref));
  if (previousRevision) {
    const current = await readItem(
      get,
      `${api}/pages/${ref.id}`,
      revisionSchema,
      `Confluence page ${ref.id}`,
    );
    if (current.version && String(current.version.number) === previousRevision) return undefined;
  }
  const page = await readItem(
    get,
    `${api}/pages/${ref.id}?body-format=view`,
    pageSchema,
    `Confluence page ${ref.id}`,
  );
  const ancestors: string[] = [];
  for (let parent = page; ancestors.length < DEPTH && parent.parentType === 'page'; ) {
    const id = parent.parentId;
    if (!id) break;
    try {
      parent = await readItem(get, `${api}/pages/${id}`, pageSchema, `Confluence page ${id}`);
    } catch (error) {
      if (error instanceof MesaError && error.code === 'not_found') break;
      throw error;
    }
    ancestors.unshift(parent.title);
  }
  const body = await htmlToMarkdown(page.body?.view?.value ?? '', ref.url);
  const markdown = [ancestors.length ? `Ancestors: ${ancestors.join(' > ')}` : '', body]
    .filter(Boolean)
    .join('\n\n');
  return {
    ...ref,
    title: page.title,
    markdown,
    ...(page.version ? { revision: String(page.version.number) } : {}),
  };
}
