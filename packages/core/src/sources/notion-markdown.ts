// Notion's enhanced Markdown (developers.notion.com/guides/data-apis/enhanced-markdown), which its
// page-as-Markdown endpoint answers, made plain Markdown where it names another item: a child
// page or database, and a mention of a page, database, or person, become links (a person their
// name), and empty blocks go. Callouts, toggles, columns, and tables stay as Notion writes them.

const LINKS =
  /<(page|database|mention-page|mention-database|mention-data-source)\b[^>]*?\burl="([^"]*)"[^>]*>([\s\S]*?)<\/\1>/g;
const PEOPLE = /<mention-user\b[^>]*>([\s\S]*?)<\/mention-user>/g;
const EMPTY = /^[ \t]*<empty-block\/>[ \t]*\n?/gm;

/** `markdown` from Notion with its links to other items as Markdown links. */
export const notionMarkdown = (markdown: string) =>
  markdown
    .replace(LINKS, (_, _tag, url: string, title: string) => `[${title.trim() || url}](${url})`)
    .replace(PEOPLE, (_, name: string) => `@${name.trim()}`)
    .replace(EMPTY, '')
    .trim();
