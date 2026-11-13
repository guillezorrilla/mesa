import { expect, test } from 'vitest';
import type { Block } from './markdownNodes';
import { markdownTree } from './markdownTree';

const text = (value: string) => ({ type: 'text', value });

test('headings, paragraphs with their line breaks, and a rule', () => {
  expect(markdownTree('## Why\nOne line\nand the next\n\n---')).toEqual([
    { type: 'heading', depth: 2, children: [text('Why')] },
    { type: 'paragraph', children: [text('One line\nand the next')] },
    { type: 'rule' },
  ]);
});

test('inline code, emphasis, strikethrough and links; bare URLs link too', () => {
  const [p] = markdownTree(
    'Run `pnpm tide` **now**, ~~later~~ [docs](https://tide.example/a) https://tide.example/b',
  );
  expect(p).toEqual({
    type: 'paragraph',
    children: [
      text('Run '),
      { type: 'code', value: 'pnpm tide' },
      text(' '),
      { type: 'strong', children: [text('now')] },
      text(', '),
      { type: 'del', children: [text('later')] },
      text(' '),
      { type: 'link', href: 'https://tide.example/a', children: [text('docs')] },
      text(' '),
      { type: 'link', href: 'https://tide.example/b', children: [text('https://tide.example/b')] },
    ],
  });
});

test('a link a tap must not open stays its text', () => {
  expect(markdownTree('[here](tidepool://open) and [there](/lee/tide/pull/2)')).toEqual([
    { type: 'paragraph', children: [text('here and there')] },
  ]);
});

test('task lists read as checked boxes; plain items have none', () => {
  const [list] = markdownTree('- [ ] write it\n- [x] test it\n- ship it');
  expect(list).toMatchObject({
    type: 'list',
    ordered: false,
    children: [
      { checked: false, children: [{ type: 'paragraph', children: [text('write it')] }] },
      { checked: true, children: [{ type: 'paragraph', children: [text('test it')] }] },
      { checked: null, children: [{ type: 'paragraph', children: [text('ship it')] }] },
    ],
  });
});

test('ordered lists keep their start, fenced code its text, quotes their blocks', () => {
  expect(
    markdownTree('3. three\n4. four\n\n```ts\nconst tide = 1;\n```\n\n> quoted'),
  ).toMatchObject([
    { type: 'list', ordered: true, start: 3 },
    { type: 'code', value: 'const tide = 1;' },
    { type: 'quote', children: [{ type: 'paragraph', children: [text('quoted')] }] },
  ]);
});

test('a table is rows of cells, the first row its header', () => {
  const [table] = markdownTree('| Name | From |\n| --- | --- |\n| tide | 1.2 |');
  expect(table).toEqual({
    type: 'table',
    children: [
      {
        type: 'row',
        children: [
          { type: 'cell', header: true, children: [text('Name')] },
          { type: 'cell', header: true, children: [text('From')] },
        ],
      },
      {
        type: 'row',
        children: [
          { type: 'cell', header: false, children: [text('tide')] },
          { type: 'cell', header: false, children: [text('1.2')] },
        ],
      },
    ],
  });
});

// Invented, in the shape a Dependabot bump's body takes.
const BUMP = `Bumps [tidelib](https://github.com/lee-park/tidelib) from 1.2.0 to 1.3.0.
<details>
<summary>Release notes</summary>
<p><em>Sourced from <a href="https://github.com/lee-park/tidelib/releases">tidelib's releases</a>.</em></p>
<blockquote>
<h2>v1.3.0</h2>
<ul>
<li>Reads the moon <code>phase</code> (<a href="https://github.com/lee-park/tidelib/pull/41">#41</a>)</li>
</ul>
</blockquote>
</details>
<details>
<summary>Commits</summary>
<ul>
<li><a href="https://github.com/lee-park/tidelib/commit/ab12cd3"><code>ab12cd3</code></a> v1.3.0</li>
</ul>
</details>
<br />

---

<details>
<summary>Dependabot commands and options</summary>
<br />

- \`@dependabot rebase\` will rebase this PR

</details>`;

test("a Dependabot body's HTML sections read as closed details with Markdown inside", () => {
  const blocks = markdownTree(BUMP);
  expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'details', 'details', 'rule', 'details']);
  expect(blocks[1]).toEqual({
    type: 'details',
    open: false,
    summary: [text('Release notes')],
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'em',
            children: [
              text('Sourced from '),
              {
                type: 'link',
                href: 'https://github.com/lee-park/tidelib/releases',
                children: [text("tidelib's releases")],
              },
              text('.'),
            ],
          },
        ],
      },
      { type: 'heading', depth: 2, children: [text('v1.3.0')] },
      {
        type: 'list',
        ordered: false,
        start: 1,
        children: [
          {
            type: 'item',
            checked: null,
            children: [
              {
                type: 'paragraph',
                children: [
                  text('Reads the moon '),
                  { type: 'code', value: 'phase' },
                  text(' ('),
                  {
                    type: 'link',
                    href: 'https://github.com/lee-park/tidelib/pull/41',
                    children: [text('#41')],
                  },
                  text(')'),
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(blocks[2]).toMatchObject({
    summary: [text('Commits')],
    children: [
      {
        type: 'list',
        children: [
          {
            children: [
              {
                children: [
                  {
                    type: 'link',
                    href: 'https://github.com/lee-park/tidelib/commit/ab12cd3',
                    children: [{ type: 'code', value: 'ab12cd3' }],
                  },
                  text(' v1.3.0'),
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  expect(blocks[4]).toMatchObject({
    summary: [text('Dependabot commands and options')],
    children: [{ type: 'list' }],
  });
});

test('<details open> starts open; nesting past eight levels stays flat', () => {
  expect(markdownTree('<details open>\n<summary>Logs</summary>\n\nok\n\n</details>')).toEqual([
    {
      type: 'details',
      open: true,
      summary: [text('Logs')],
      children: [{ type: 'paragraph', children: [text('ok')] }],
    },
  ]);
  const deep = markdownTree(`${'<details>\n'.repeat(12)}\nx\n`);
  let depth = 0;
  for (let node = deep[0]; node?.type === 'details'; node = node.children[0]) depth++;
  expect(depth).toBe(8);
});

test('inline HTML GitHub allows draws as spans; raw tags never show', () => {
  expect(
    markdownTree(
      '<b>bold</b> <kbd>Esc</kbd> <a href="https://tide.example">site</a> a<br>b <span>s</span><!-- hidden -->',
    ),
  ).toEqual([
    {
      type: 'paragraph',
      children: [
        { type: 'strong', children: [text('bold')] },
        text(' '),
        { type: 'code', value: 'Esc' },
        text(' '),
        { type: 'link', href: 'https://tide.example', children: [text('site')] },
        text(' a\nb s'),
      ],
    },
  ]);
});

test('a tag GitHub does not allow shows as typed, as GitHub shows it', () => {
  expect(markdownTree('uses Array<string> here')).toEqual([
    { type: 'paragraph', children: [text('uses Array<string> here')] },
  ]);
});

test('a section past the cap still closes only itself', () => {
  // The ninth opens no section; its `</details>` must not close the eighth.
  const source = `${'<details>\n'.repeat(9)}\ninner\n\n</details>\n\nmiddle\n\n${'</details>\n'.repeat(8)}\nafter\n`;
  let node: Block | undefined = markdownTree(source)[0];
  for (let depth = 1; depth < 8; depth++)
    node = node?.type === 'details' ? node.children[0] : undefined;
  expect(node).toMatchObject({
    type: 'details',
    children: [
      { type: 'paragraph', children: [text('inner')] },
      { type: 'paragraph', children: [text('middle')] },
    ],
  });
});
