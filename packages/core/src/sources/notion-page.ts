import { z } from 'zod';
import type { Http } from '../lib/http.js';
import type { Item, ItemRef } from './items.js';
import { notionCall, parentSchema } from './notion.js';
import { notionMarkdown } from './notion-markdown.js';
import { pageTitle, propertiesSchema, propertyLines } from './notion-properties.js';

const pageSchema = z.object({ parent: parentSchema, properties: propertiesSchema });
const markdownSchema = z.object({ markdown: z.string(), truncated: z.boolean().optional() });

/**
 * A Notion page, or a database row (a page whose parent is a data source), as an item: its title,
 * a row's properties as a list, and its content from Notion's own page-as-Markdown endpoint, its
 * links to other items made Markdown links (notionMarkdown). Two GETs; reads only.
 */
export async function notionPage(get: Http, ref: ItemRef): Promise<Item> {
  const what = `Notion page ${ref.id}`;
  const page = await notionCall(get, `/pages/${ref.id}`, pageSchema, what);
  const { markdown, truncated } = await notionCall(
    get,
    `/pages/${ref.id}/markdown`,
    markdownSchema,
    `${what}'s content`,
  );
  const row = page.parent?.type === 'data_source_id' || page.parent?.type === 'database_id';
  const sections = [
    row ? propertyLines(page.properties).join('\n') : '',
    notionMarkdown(markdown),
    truncated ? '_Notion cut this page short: it is longer than one read returns._' : '',
  ];
  return {
    ...ref,
    title: pageTitle(page.properties) || 'Untitled',
    markdown: sections.filter(Boolean).join('\n\n'),
  };
}
