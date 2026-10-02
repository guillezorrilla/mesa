import { expect, test } from 'vitest';
import { notionMarkdown } from './notion-markdown.js';

test('an item Notion gives no title links under a name, not its bare URL', () => {
  const md =
    '<database url="https://app.notion.com/p/abc" inline="true"></database>\n<page url="https://app.notion.com/p/def">Harbour plan</page>';
  expect(notionMarkdown(md)).toBe(
    '[Untitled database](https://app.notion.com/p/abc)\n[Harbour plan](https://app.notion.com/p/def)',
  );
});
