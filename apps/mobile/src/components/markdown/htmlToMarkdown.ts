import { attr, GITHUB_TAGS } from './htmlTags';

// The HTML GitHub allows in a block (a Dependabot body's release notes and commits), as Markdown the
// tree reads again, the way orca's mobile app previews it (mobile-markdown-preview-html.ts): links,
// emphasis, code, headings, paragraphs and list items keep their shape, other allowed tags only
// their text. Each pattern stops at the next tag of its kind, so unclosed markup stays linear.
// ponytail: entities inside code stay as typed (`&lt;`); decode them if release notes show it.

const tags = (names: string) => new RegExp(`<(?:${names})(?=[\\s/>])[^<>]*>`, 'gi');
const closes = (names: string) => new RegExp(`</(?:${names})\\s*>`, 'gi');

const ANCHOR = /<a(?=[\s/>])([^<>]*)>((?:(?!<\/?a\b)[\s\S])*)<\/a\s*>/gi;
const COMMENT = /<!--(?:(?!-->)[\s\S])*(?:-->|$)/g;
const ALLOWED = new RegExp(`</?(?:${[...GITHUB_TAGS].join('|')})(?=[\\s/>])[^<>]*>`, 'gi');

/** An HTML block as Markdown: what GitHub draws of it, with no tag left that GitHub allows. */
export function htmlToMarkdown(html: string) {
  return (
    html
      .replace(COMMENT, '')
      .replace(tags('br'), '\n')
      .replace(tags('img'), (tag) => attr(tag.slice(4, -1), 'alt'))
      .replace(/<pre(?=[\s/>])[^<>]*>\s*(?:<code(?=[\s/>])[^<>]*>)?/gi, '\n\n```\n')
      .replace(/\n?(?:<\/code\s*>\s*)?<\/pre\s*>/gi, '\n```\n\n')
      .replace(tags('code|kbd|tt'), '`')
      .replace(closes('code|kbd|tt'), '`')
      .replace(ANCHOR, (_, attrs: string, text: string) => {
        const href = attr(attrs, 'href');
        return href ? `[${text}](<${href}>)` : text;
      })
      .replace(tags('strong|b'), '**')
      .replace(closes('strong|b'), '**')
      .replace(tags('em|i'), '*')
      .replace(closes('em|i'), '*')
      .replace(tags('del|s|strike'), '~~')
      .replace(closes('del|s|strike'), '~~')
      .replace(/<h([1-6])(?=[\s/>])[^<>]*>/gi, (_, depth: string) => `\n\n${'#'.repeat(+depth)} `)
      .replace(tags('li'), '\n- ')
      .replace(tags('hr'), '\n\n---\n\n')
      .replace(closes('h[1-6]|p|div|ul|ol|blockquote|table|tr|details'), '\n\n')
      .replace(tags('p|div|ul|ol|blockquote|table|tr'), '\n\n')
      .replace(ALLOWED, '')
      // HTML's indentation would read as indented code.
      .replace(/^[ \t]+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
