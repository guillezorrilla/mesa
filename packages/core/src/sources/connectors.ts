import type { Http } from '../lib/http.js';
import { confluencePage } from './confluence.js';
import type { Item, ItemRef, ItemSource } from './items.js';
import { jiraIssue } from './jira.js';
import type { SourceId } from './sources.js';
import { webPage } from './web.js';

/**
 * How each kind of item is fetched, one row each: the Source whose connection its calls go
 * through (none for a public web page, fetched with plain HTTP), and the fetch, which only reads.
 * A new Source adds a row here and its links to links.ts.
 */
export const CONNECTORS: Record<
  ItemSource,
  { connection?: SourceId; fetch: (get: Http, ref: ItemRef) => Promise<Item> }
> = {
  jira: { connection: 'atlassian', fetch: jiraIssue },
  confluence: { connection: 'atlassian', fetch: confluencePage },
  web: { fetch: webPage },
};
