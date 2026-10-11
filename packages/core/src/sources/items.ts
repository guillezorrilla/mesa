// An item a project imports (CONTEXT.md, Import): a Jira issue, a Confluence page, a Notion page,
// a ClickUp task or Doc page, a GitHub issue, or a web page.

/** An imported Jira issue's title: its key, then its summary. */
export const jiraTitle = (key: string, summary: string) => `${key}: ${summary}`;

/**
 * The id an import of ticket `key` gives the item, which sessions started from it record: the
 * key, with an issue number's `#` made a folder (GitHub's owner/repo#12 is owner/repo/12).
 */
export const itemIdOfKey = (key: string) => key.replace('#', '/');

/** Where an item comes from: its folder under `raw/`, and its snapshots' `source`. */
export const ITEM_SOURCES = ['jira', 'confluence', 'notion', 'clickup', 'github', 'web'] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

/** A link resolved to one item (links.ts). */
export type ItemRef = {
  source: ItemSource;
  /**
   * The issue key, the page id (Notion's 32 hex), the ClickUp task id or `<doc>.<page>`, a
   * GitHub issue's `<owner>/<repo>/<number>`, or the web URL's slug: the item's folder,
   * raw/<source>/<id>/.
   */
  id: string;
  /** Its canonical URL, which a refresh resolves again. */
  url: string;
  /** The cloud id of the Atlassian site it lives on. */
  site?: string;
};

/** An item fetched: its title, and its content as Markdown. */
export type Item = ItemRef & { title: string; markdown: string; revision?: string };
