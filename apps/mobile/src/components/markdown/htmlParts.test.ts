import { expect, test } from 'vitest';
import { detailsPieces } from './detailsPieces';
import { attr } from './htmlTags';
import { htmlToMarkdown } from './htmlToMarkdown';
import { inlineTag } from './inlineTag';

test('details markup is cut out of an HTML block, open only as an attribute', () => {
  expect(
    detailsPieces(
      '<details title="open logs">\n<summary><b>Logs</b></summary>\n<p>x</p>\n</details>',
    ),
  ).toEqual([
    { kind: 'open', open: false },
    { kind: 'summary', value: '<b>Logs</b>' },
    { kind: 'html', value: '\n<p>x</p>\n' },
    { kind: 'close' },
  ]);
  expect(detailsPieces('<details open><summary>S</summary>')).toEqual([
    { kind: 'open', open: true },
    { kind: 'summary', value: 'S' },
  ]);
});

test('an unclosed summary stays HTML and costs one pass', () => {
  const hostile = '<summary>'.repeat(20_000);
  const started = performance.now();
  expect(detailsPieces(hostile)).toEqual([{ kind: 'html', value: hostile }]);
  expect(performance.now() - started).toBeLessThan(500);
});

test('attributes are read quoted or bare, with &amp; decoded', () => {
  expect(attr(' href="https://a.example/?x=1&amp;y=2" title=t', 'href')).toBe(
    'https://a.example/?x=1&y=2',
  );
  expect(attr(" alt='Score'", 'alt')).toBe('Score');
  expect(attr(' title=t', 'href')).toBe('');
});

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

test('inline tags read as the span tokens they stand for', () => {
  expect(inlineTag('<strong>')).toMatchObject({ type: 'strong_open' });
  expect(inlineTag('</EM>')).toMatchObject({ type: 'em_close' });
  expect(inlineTag('<a href="https://a.example">')).toMatchObject({
    type: 'link_open',
    href: 'https://a.example',
  });
  expect(inlineTag('<br />')).toMatchObject({ type: 'text', content: '\n' });
  expect(inlineTag('<img alt="logo" src="x">')).toMatchObject({ type: 'text', content: 'logo' });
  expect(inlineTag('<sup>')).toMatchObject({ type: 'text', content: '' });
  expect(inlineTag('<script>')).toMatchObject({ type: 'text', content: '<script>' });
  expect(inlineTag('<!-- x -->')).toMatchObject({ type: 'text', content: '' });
});
