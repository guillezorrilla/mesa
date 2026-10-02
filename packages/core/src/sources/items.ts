// An item a project imports (CONTEXT.md, Import): a Jira issue, a Confluence page, a Notion page,
// or a web page.

/** Where an item comes from: its folder under `raw/`, and its snapshots' `source`. */
export const ITEM_SOURCES = ['jira', 'confluence', 'notion', 'web'] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

/** A link resolved to one item (links.ts). */
export type ItemRef = {
  source: ItemSource;
  /**
   * The issue key, the page id (Notion's 32 hex), or the web URL's slug: the item's folder,
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
