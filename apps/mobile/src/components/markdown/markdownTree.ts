import MarkdownIt from 'markdown-it';
import { detailsPieces } from './detailsPieces';
import { htmlToMarkdown } from './htmlToMarkdown';
import { inlines } from './markdownInlines';
import type { Block, Inline, Item } from './markdownNodes';

// GitHub-flavoured Markdown read by markdown-it, as orca's mobile app reads it
// (mobile-markdown-tree.ts): HTML on, bare URLs linked; markdown-it's flat tokens become the tree.
const md = new MarkdownIt({ html: true, linkify: true });

type Token = ReturnType<MarkdownIt['parse']>[number];
type Node = { type: string; children: unknown[] };
type Open = { node: Node; close: string };

/** Deeper `<details>` sections stay text, so hostile nesting cannot grow the tree without end. */
const MAX_DETAILS = 8;
const TASK = /^\[([ xX])\](?:\s+|$)/;

const OPENERS: Record<string, (token: Token) => Node> = {
  paragraph_open: () => ({ type: 'paragraph', children: [] }),
  heading_open: (t) => ({ type: 'heading', depth: Number(t.tag.slice(1)), children: [] }) as Node,
  blockquote_open: () => ({ type: 'quote', children: [] }),
  bullet_list_open: () => ({ type: 'list', ordered: false, start: 1, children: [] }) as Node,
  ordered_list_open: (t) =>
    ({ type: 'list', ordered: true, start: Number(t.attrGet('start') ?? 1), children: [] }) as Node,
  list_item_open: () => ({ type: 'item', checked: null, children: [] }) as Node,
  table_open: () => ({ type: 'table', children: [] }),
  tr_open: () => ({ type: 'row', children: [] }),
  th_open: () => ({ type: 'cell', header: true, children: [] }) as Node,
  td_open: () => ({ type: 'cell', header: false, children: [] }) as Node,
};

/** A task list item's `[ ]` or `[x]` opening its first paragraph, read off as its box. */
function readTask(item: Item) {
  const first = item.children[0];
  const lead = first?.type === 'paragraph' ? first.children[0] : undefined;
  const marker = lead?.type === 'text' ? TASK.exec(lead.value) : null;
  if (lead?.type !== 'text' || !marker) return;
  item.checked = marker[1] !== ' ';
  lead.value = lead.value.slice(marker[0].length);
}

/** Closes the innermost open node that `close` ends, and whatever is still open inside it. */
function closeTo(stack: Open[], close: string) {
  const at = stack.findLastIndex((open) => open.close === close);
  if (at < 1) return;
  for (const { node } of stack.splice(at)) if (node.type === 'item') readTask(node as Item);
}

const inlineMarkdown = (text: string) => inlines(md.parseInline(text, {})[0]?.children ?? []);

/** An HTML block: its `<details>` open and close sections, the rest is read again as Markdown. */
function htmlBlock(html: string, stack: Open[], nested: boolean) {
  const top = () => (stack.at(-1) as Open).node;
  // HTML left after one pass is not GitHub's: it shows as typed.
  if (nested) {
    top().children.push({ type: 'paragraph', children: [{ type: 'text', value: html.trim() }] });
    return;
  }
  for (const piece of detailsPieces(html)) {
    const node = top() as Node & { summary?: Inline[] };
    if (piece.kind === 'open') {
      // Past the cap a section is no node, but its `</details>` still closes only it.
      if (stack.filter((open) => open.close === '</details>').length >= MAX_DETAILS) {
        stack.push({ node, close: '</details>' });
        continue;
      }
      const details = { type: 'details', open: piece.open, summary: [], children: [] };
      node.children.push(details);
      stack.push({ node: details, close: '</details>' });
    } else if (piece.kind === 'close') closeTo(stack, '</details>');
    else if (piece.kind === 'summary' && node.summary?.length === 0)
      node.summary = inlineMarkdown(htmlToMarkdown(piece.value));
    else if (piece.kind !== 'summary')
      node.children.push(...tree(htmlToMarkdown(piece.value), true));
  }
}

function tree(source: string, nested: boolean): Block[] {
  const root: Node = { type: 'root', children: [] };
  const stack: Open[] = [{ node: root, close: '' }];
  for (const t of md.parse(source, {})) {
    const top = (stack.at(-1) as Open).node;
    const open = OPENERS[t.type];
    if (open) {
      const node = open(t);
      top.children.push(node);
      stack.push({ node, close: t.type.replace(/_open$/, '_close') });
    } else if (t.type === 'inline') top.children.push(...inlines(t.children ?? []));
    else if (t.type === 'fence' || t.type === 'code_block')
      top.children.push({ type: 'code', value: t.content.replace(/\n$/, '') });
    else if (t.type === 'hr') top.children.push({ type: 'rule' });
    else if (t.type === 'html_block') htmlBlock(t.content, stack, nested);
    else if (t.nesting === -1) closeTo(stack, t.type);
  }
  closeTo(stack, (stack[1] as Open | undefined)?.close ?? '');
  return root.children as Block[];
}

/** A PR's, comment's or ticket's text, GitHub-flavoured Markdown with the HTML GitHub allows, as the
 *  blocks the Markdown component draws. */
export const markdownTree = (source: string) => tree(source, false);
