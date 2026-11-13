import { attr, GITHUB_TAGS, SPANS } from './htmlTags';

// The HTML GitHub allows in a block (a Dependabot body's release notes and commits), as Markdown the
// tree reads again, the way orca's mobile app previews it (mobile-markdown-preview-html.ts): links,
// emphasis, code, headings, paragraphs and list items keep their shape, a table's cells stand in a
// row, other allowed tags keep only their text. Each pattern stops at the next tag of its kind, so
// unclosed markup stays linear.
// ponytail: a <pre>'s indentation goes with the HTML's; keep it if release notes need it.

const tags = (names: string) => new RegExp(`<(?:${names})(?=[\\s/>])[^<>]*>`, 'gi');
const closes = (names: string) => new RegExp(`</(?:${names})\\s*>`, 'gi');
const named = (kind: string) =>
  Object.keys(SPANS)
    .filter((tag) => SPANS[tag] === kind)
    .join('|');

/** A span's Markdown marker; a link and code are read whole. */
const MARK: Record<string, string> = { strong: '**', em: '*', s: '~~' };
const CODES = named('code');

const COMMENT = /<!--(?:(?!-->)[\s\S])*(?:-->|$)/g;
const PRE =
  /<pre(?=[\s/>])[^<>]*>\s*(?:<code(?=[\s/>])[^<>]*>)?((?:(?!<\/?pre\b)[\s\S])*?)\n?(?:<\/code\s*>\s*)?<\/pre\s*>/gi;
const CODE = new RegExp(
  `<(${CODES})(?=[\\s/>])[^<>]*>((?:(?!</?(?:${CODES})\\b)[\\s\\S])*)</\\1\\s*>`,
  'gi',
);
const ANCHOR = /<a(?=[\s/>])([^<>]*)>((?:(?!<\/?a\b)[\s\S])*)<\/a\s*>/gi;
const SPAN = /<\/?([a-z]+)(?=[\s/>])[^<>]*>/gi;
const ALLOWED = new RegExp(`</?(?:${[...GITHUB_TAGS].join('|')})(?=[\\s/>])[^<>]*>`, 'gi');

/** Code is literal in Markdown, so its entities are read here. */
const decoded = (code: string) =>
  code
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');

/** An HTML block as Markdown: what GitHub draws of it, with no tag left that GitHub allows. */
export function htmlToMarkdown(html: string) {
  return (
    html
      .replace(COMMENT, '')
      .replace(tags('br'), '\n')
      .replace(tags('img'), (tag) => attr(tag.slice(4, -1), 'alt'))
      .replace(PRE, (_, code: string) => `\n\n\`\`\`\n${decoded(code)}\n\`\`\`\n\n`)
      .replace(CODE, (_, _tag, code: string) => `\`${decoded(code)}\``)
      .replace(ANCHOR, (_, attrs: string, text: string) => {
        const href = attr(attrs, 'href');
        return href ? `[${text}](<${href}>)` : text;
      })
      .replace(SPAN, (tag, name: string) => MARK[SPANS[name.toLowerCase()] ?? ''] ?? tag)
      .replace(/<h([1-6])(?=[\s/>])[^<>]*>/gi, (_, depth: string) => `\n\n${'#'.repeat(+depth)} `)
      .replace(tags('li'), '\n- ')
      .replace(tags('hr'), '\n\n---\n\n')
      .replace(closes('td|th'), ' | ')
      .replace(closes('h[1-6]|p|div|ul|ol|blockquote|table|tr|details'), '\n\n')
      .replace(tags('p|div|ul|ol|blockquote|table|tr'), '\n\n')
      .replace(ALLOWED, '')
      // HTML's indentation would read as indented code.
      .replace(/^[ \t]+/gm, '')
      .replace(/ \| \n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
