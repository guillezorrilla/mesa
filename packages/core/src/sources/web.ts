import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';
import { htmlToMarkdown } from '../lib/html-markdown.js';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Item, ItemRef } from './items.js';

/**
 * A public web page as an item: fetched with no sign-in, cleaned by Defuddle, as Markdown. A page
 * that does not answer 2xx, or answers with something other than HTML, is refused.
 */
export async function webPage(get: Http, ref: ItemRef): Promise<Item> {
  const response = await get(ref.url, { headers: { accept: 'text/html' } });
  if (!response.ok) {
    throw new MesaError(
      response.status === 404 ? 'not_found' : 'internal',
      `${ref.url} answered HTTP ${response.status}`,
    );
  }
  const type = response.headers.get('content-type') ?? 'text/html';
  if (!type.includes('html')) {
    throw new MesaError('usage', `${ref.url} is ${type.split(';')[0]}, not a web page`);
  }
  const { title, markdown } = await readablePage(await response.text(), ref.url);
  return { ...ref, title: title || ref.url, markdown };
}

/** A whole web page's main content, cleaned by Defuddle (no menus, ads, or footers), as Markdown. */
async function readablePage(html: string, url: string) {
  const { title, content } = await Defuddle(parseHTML(html).document, url, { useAsync: false });
  return { title: title.trim(), markdown: await htmlToMarkdown(content, url) };
}
