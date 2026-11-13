import { attr, GITHUB_TAGS } from './htmlTags';

/** A markdown-it inline token as the tree reads it: its type, its text, and a link's href. */
export type InlineToken = { type: string; content: string; href: string };

// Inline HTML GitHub draws as a span, named as markdown-it names that span's tokens.
const SPANS: Record<string, string> = {
  a: 'link',
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  del: 's',
  s: 's',
  strike: 's',
  code: 'code',
  kbd: 'code',
  tt: 'code',
};

const TAG = /^<(\/?)([a-z][a-z0-9]*)(?=[\s/>])([^<>]*)>$/i;

const text = (content: string): InlineToken => ({ type: 'text', content, href: '' });

/** One inline HTML tag as the token it stands for: `<b>` opens strong, `<br>` is a line break, an
 *  image its alt text; another tag GitHub allows keeps only the text around it, any other shows. */
export function inlineTag(html: string): InlineToken {
  if (html.startsWith('<!--')) return text('');
  const match = TAG.exec(html.trim());
  if (!match) return text(html);
  const [, closing, raw = '', attrs = ''] = match;
  const name = raw.toLowerCase();
  if (name === 'br') return text('\n');
  if (name === 'img') return text(attr(attrs, 'alt'));
  const span = SPANS[name];
  if (span)
    return {
      type: `${span}_${closing ? 'close' : 'open'}`,
      content: '',
      href: attr(attrs, 'href'),
    };
  return text(GITHUB_TAGS.has(name) ? '' : html);
}
