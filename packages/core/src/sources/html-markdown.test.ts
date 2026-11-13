import { expect, test } from 'vitest';
import { htmlToMarkdown } from './html-markdown.js';

// Invented Atlassian-rendered HTML.

test("Atlassian's task items and HTML checkboxes become GitHub task lists", async () => {
  const tasks =
    '<ul class="inline-task-list"><li data-inline-task-id="1" class="checked">Chart opens on <b>today</b></li><li data-inline-task-id="2">Times in the harbour zone</li></ul>';
  expect(await htmlToMarkdown(tasks, 'https://tide.atlassian.net/browse/TIDE-12')).toBe(
    '- [x] Chart opens on **today**\n- [ ] Times in the harbour zone',
  );
  const boxes =
    '<ul><li><input type="checkbox" checked> rounded</li><li><input type="checkbox"> zoned</li></ul>';
  expect(await htmlToMarkdown(boxes, 'https://tide.atlassian.net/browse/TIDE-12')).toBe(
    '- [x] rounded\n- [ ] zoned',
  );
});

test('a plain list and bracketed text elsewhere stay as they were', async () => {
  expect(
    await htmlToMarkdown(
      '<ul><li>one</li></ul><p>[draft] notes</p>',
      'https://tide.atlassian.net/',
    ),
  ).toBe('- one\n\n\\[draft\\] notes');
});
