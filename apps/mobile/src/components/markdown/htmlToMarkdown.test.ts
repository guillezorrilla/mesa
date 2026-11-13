import { expect, test } from 'vitest';
import { htmlToMarkdown } from './htmlToMarkdown';

test('block HTML becomes Markdown: links, code, emphasis, headings, list items, images by alt', () => {
  expect(
    htmlToMarkdown(
      '<h3>Notes</h3>\n  <p><strong>New</strong> <a href="https://a.example/x (1)">link</a></p>\n<ul>\n<li><code>ab12</code> fix</li>\n</ul>\n<img src="https://a.example/badge.svg" alt="badge">',
    ),
  ).toBe('### Notes\n\n**New** [link](<https://a.example/x (1)>)\n\n- `ab12` fix\n\nbadge');
});

test('pre blocks become fenced code; comments go, allowed tags keep their text', () => {
  expect(htmlToMarkdown('<pre><code>npm i\n</code></pre><!-- note --><span>kept</span>')).toBe(
    '```\nnpm i\n```\n\nkept',
  );
});

test("code keeps its entities' characters, as GitHub shows them", () => {
  expect(htmlToMarkdown('<p>Use <code>Array&lt;T&gt;</code></p><pre>a &amp;&amp; b</pre>')).toBe(
    'Use `Array<T>`\n\n```\na && b\n```',
  );
});

test("a table's rows stand on their own lines, cells apart", () => {
  expect(
    htmlToMarkdown(
      '<table><tr><th>Name</th><th>From</th></tr><tr><td>tide</td><td>1.2</td></tr></table>',
    ),
  ).toBe('Name | From\n\ntide | 1.2');
});
