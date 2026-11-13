import type MarkdownIt from 'markdown-it';
import { type InlineToken, inlineTag } from './inlineTag';
import type { Inline } from './markdownNodes';

type Token = ReturnType<MarkdownIt['parse']>[number];

/** What a tap may open: the web and mail, never another app's scheme. */
const OPENABLE = /^(?:https?:|mailto:)/i;

const asToken = (t: Token): InlineToken =>
  t.type === 'html_inline'
    ? inlineTag(t.content)
    : { type: t.type, content: t.content, href: t.attrGet('href') ?? '' };

const plain = (nodes: Inline[]): string =>
  nodes.map((n) => ('value' in n ? n.value : plain(n.children))).join('');

/** markdown-it's inline tokens as runs of text; inline HTML reads as the span it stands for. */
export function inlines(tokens: Token[]): Inline[] {
  let at = 0;
  const run = (close?: string): Inline[] => {
    const out: Inline[] = [];
    const text = (value: string) => {
      const last = out.at(-1);
      if (last?.type === 'text') last.value += value;
      else if (value) out.push({ type: 'text', value });
    };
    while (at < tokens.length) {
      const t = asToken(tokens[at++] as Token);
      if (t.type === close) break;
      if (t.type === 'text') text(t.content);
      // GitHub keeps a body's line breaks.
      else if (t.type === 'softbreak' || t.type === 'hardbreak') text('\n');
      // Images never load: the alt text stands in.
      else if (t.type === 'image') text(t.content);
      else if (t.type === 'code_inline') out.push({ type: 'code', value: t.content });
      else if (t.type === 'code_open') out.push({ type: 'code', value: plain(run('code_close')) });
      else if (t.type === 'strong_open')
        out.push({ type: 'strong', children: run('strong_close') });
      else if (t.type === 'em_open') out.push({ type: 'em', children: run('em_close') });
      else if (t.type === 's_open') out.push({ type: 'del', children: run('s_close') });
      else if (t.type === 'link_open') {
        const children = run('link_close');
        if (OPENABLE.test(t.href)) out.push({ type: 'link', href: t.href, children });
        else
          for (const child of children) child.type === 'text' ? text(child.value) : out.push(child);
      }
    }
    return out;
  };
  return run();
}
