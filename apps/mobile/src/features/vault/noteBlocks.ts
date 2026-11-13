// A note's Markdown as blocks of styled spans, for the phone's reader to draw with native Text
// (ADR-0027: no WebView). Its links are the Mac's (core's vault/links.ts): a link opens the vault
// item it resolved to, matched by the text it was written as; one that resolved to none is broken.
// ponytail: headings, lists, tasks, quotes, code, tables as code, rules, bold, italic, code spans
// and links; nested emphasis and HTML show as written. Add more when a real note needs it.

import { pathParts } from '../../lib/pathParts';

export type Span = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  /** A vault item to open. */
  path?: string;
  url?: string;
  /** A vault link that leads nowhere Mesa can tell. */
  broken?: boolean;
};

export type Block =
  | { kind: 'heading'; level: number; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'item'; depth: number; marker: string; spans: Span[] }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'code'; text: string }
  | { kind: 'rule' };

type Link = { text: string; path: string };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ ]?(.*)$/;
const ITEM = /^([ \t]*)([-*+]|\d+[.)])[ \t]+(?:\[([ xX])\][ \t]+)?(.*)$/;
const TABLE = /^[ \t]*\|.*\|[ \t]*$/;
const INLINE =
  /(`+)(.+?)\1|(!?\[\[([^[\]\n]+)\]\])|(!?\[([^[\]\n]*)\]\(([^()\n]*)\))|\*\*(.+?)\*\*|\*([^*\n]+)\*/g;
const URL = /^[a-z][a-z0-9+.-]*:/i;

/** A wikilink's words: its alias, else its target's file name and any heading after it. */
function wikiWords(inner: string) {
  const [target = '', alias] = inner.split('|');
  if (alias?.trim()) return alias.trim();
  const [file = '', sub] = target.split('#');
  const name = pathParts(file).name.replace(/\.md$/i, '');
  return [name, sub].filter(Boolean).join(' > ');
}

/** One line or paragraph's text as spans, its links matched to `paths` by their written text. */
export function spansOf(text: string, paths: ReadonlyMap<string, string>): Span[] {
  const spans: Span[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0;
    if (index > at) spans.push({ text: text.slice(at, index) });
    at = index + m[0].length;
    const path = paths.get(m[0]);
    if (m[2] !== undefined) spans.push({ text: m[2], code: true });
    else if (m[3] !== undefined)
      spans.push({ text: wikiWords(m[4] ?? ''), ...(path ? { path } : { broken: true }) });
    else if (m[5] !== undefined) {
      const destination = m[7]?.trim() ?? '';
      const words = m[6] || destination;
      if (URL.test(destination)) spans.push({ text: words, url: destination });
      else spans.push({ text: words, ...(path ? { path } : { broken: true }) });
    } else if (m[8] !== undefined) spans.push({ text: m[8], bold: true });
    else spans.push({ text: m[9] ?? '', italic: true });
  }
  if (at < text.length) spans.push({ text: text.slice(at) });
  return spans;
}

/** A line's words as they read, its link and emphasis markup gone: for a one-line summary. */
export const plainText = (text: string) =>
  spansOf(text, new Map())
    .map((span) => span.text)
    .join('');

/** An HTML comment; one never closed runs to the end, as Obsidian hides it. */
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

/** `body` with its HTML comments gone, removed until none is left, so a nested one leaves none. */
function withoutComments(body: string) {
  let text = body;
  for (let last = ''; last !== text; ) {
    last = text;
    text = text.replace(COMMENT, '');
  }
  return text;
}

/** `body`'s blocks in order, its HTML comments hidden as Obsidian hides them; `links` are its resolved links. */
export function noteBlocks(body: string, links: readonly Link[]): Block[] {
  const paths = new Map(links.map((link) => [link.text, link.path]));
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let table: string[] = [];
  let code: { fence: string; lines: string[] } | undefined;
  let item: { depth: number; marker: string; lines: string[] } | undefined;

  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', spans: spansOf(paragraph.join(' '), paths) });
    if (quote.length) blocks.push({ kind: 'quote', spans: spansOf(quote.join(' '), paths) });
    if (table.length) blocks.push({ kind: 'code', text: table.join('\n') });
    if (item)
      blocks.push({
        kind: 'item',
        depth: item.depth,
        marker: item.marker,
        spans: spansOf(item.lines.join(' '), paths),
      });
    paragraph = [];
    quote = [];
    table = [];
    item = undefined;
  };

  for (const line of withoutComments(body).split('\n')) {
    if (code) {
      if (line.trim().startsWith(code.fence)) {
        blocks.push({ kind: 'code', text: code.lines.join('\n') });
        code = undefined;
      } else code.lines.push(line);
      continue;
    }
    const fence = FENCE.exec(line);
    const heading = HEADING.exec(line);
    const quoted = QUOTE.exec(line);
    const listed = ITEM.exec(line);
    if (fence) {
      flush();
      code = { fence: fence[1] ?? '```', lines: [] };
    } else if (!line.trim()) flush();
    else if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: heading[1]?.length ?? 1,
        spans: spansOf(heading[2] ?? '', paths),
      });
    } else if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
    } else if (TABLE.test(line)) {
      if (!table.length) flush();
      table.push(line.trim());
    } else if (quoted) {
      if (!quote.length) flush();
      quote.push(quoted[1] ?? '');
    } else if (listed) {
      flush();
      const [, indent = '', bullet = '', task, text = ''] = listed;
      const marker =
        task === undefined ? (/\d/.test(bullet) ? bullet : '•') : task === ' ' ? '☐' : '☑';
      item = { depth: Math.floor(indent.replace(/\t/g, '  ').length / 2), marker, lines: [text] };
    } else if (item && /^\s/.test(line)) item.lines.push(line.trim());
    else {
      if (!paragraph.length) flush();
      paragraph.push(line.trim());
    }
  }
  if (code) blocks.push({ kind: 'code', text: code.lines.join('\n') });
  flush();
  return blocks;
}
