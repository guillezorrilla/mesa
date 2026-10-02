import { Defuddle, type DefuddleOptions } from 'defuddle/node';
import { parseHTML } from 'linkedom';

// HTML to Markdown, the one owner (CONTEXT.md, Import): Atlassian's rendered HTML and a web page
// both become Markdown through Defuddle's converter. linkedom is the DOM, and nothing here
// fetches: Defuddle's async extractors, which call third-party APIs, are off.

const document = (html: string) =>
  parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`).document;

/** Every part of the HTML kept: Defuddle's clean-up off, only its code and heading standardizing on. */
const FAITHFUL: DefuddleOptions = {
  contentSelector: 'body',
  removeExactSelectors: false,
  removePartialSelectors: false,
  removeHiddenElements: false,
  removeLowScoring: false,
  removeSmallImages: false,
  removeContentPatterns: false,
  useAsync: false,
  markdown: true,
};

/** `html` as Markdown, all of it, its relative links made absolute against `url`. */
export async function htmlToMarkdown(html: string, url: string): Promise<string> {
  if (!html.trim()) return '';
  return (await Defuddle(document(html), url, FAITHFUL)).content.trim();
}

/** A whole web page's main content, cleaned by Defuddle (no menus, ads, or footers), as Markdown. */
export async function readablePage(html: string, url: string) {
  const page = parseHTML(html).document;
  const { title, content } = await Defuddle(page, url, { useAsync: false });
  return { title: title.trim(), markdown: await htmlToMarkdown(content, url) };
}
