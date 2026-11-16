import type { DefuddleOptions } from 'defuddle/node';

// HTML to Markdown, the one owner (CONTEXT.md, Import): Atlassian's rendered HTML and a cleaned
// web page both become Markdown through Defuddle's converter. linkedom is the DOM, and nothing
// here fetches: Defuddle's async extractors, which call third-party APIs, are off.

/**
 * Defuddle and linkedom, loaded on first use: at module load they cost every mesa start, a hook's
 * included, about 20 ms (docs/spikes/app-efficiency.md).
 */
export const converter = async () => {
  const [{ Defuddle }, { parseHTML }] = await Promise.all([
    import('defuddle/node'),
    import('linkedom'),
  ]);
  return { Defuddle, parseHTML };
};

type Page = ReturnType<Awaited<ReturnType<typeof converter>>['parseHTML']>['document'];

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

/** Task items keep their boxes, which the converter drops: Atlassian's (`li[data-inline-task-id]`,
 *  `checked` by class) and HTML checkboxes become GitHub's `[x]` and `[ ]`. */
function keepTaskBoxes(page: Page) {
  for (const item of page.querySelectorAll('li[data-inline-task-id]'))
    item.prepend(item.classList.contains('checked') ? '[x] ' : '[ ] ');
  for (const box of page.querySelectorAll('input[type=checkbox]'))
    box.replaceWith(box.hasAttribute('checked') ? '[x] ' : '[ ] ');
}

/** `html` as Markdown, all of it, its relative links made absolute against `url`. */
export async function htmlToMarkdown(html: string, url: string): Promise<string> {
  if (!html.trim()) return '';
  const { Defuddle, parseHTML } = await converter();
  const page = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`).document;
  keepTaskBoxes(page);
  const { content } = await Defuddle(page, url, FAITHFUL);
  // The converter escapes the boxes' brackets; at an item's start they are a task list.
  return content.replace(/^(\s*[-*+] )\\\[([ x])\\\] /gm, '$1[$2] ').trim();
}
