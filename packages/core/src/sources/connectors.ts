import type { Http } from '../lib/http.js';
import { clickupItem } from './clickup-item.js';
import { confluencePage } from './confluence.js';
import { githubIssue } from './github-issue.js';
import type { Item, ItemRef, ItemSource } from './items.js';
import { jiraIssue } from './jira.js';
import { linearItem } from './linear-item.js';
import { notionPage } from './notion-page.js';
import type { SourceId } from './sources.js';
import { webPage } from './web.js';

/**
 * How each kind of item is fetched, one row each: the Source whose connection its calls go
 * through (none for a public web page, fetched with plain HTTP), and the fetch, which only reads.
 * A new Source adds a row here and its links to links.ts.
 */
export const CONNECTORS: Record<
  ItemSource,
  {
    connection?: SourceId;
    fetch: (get: Http, ref: ItemRef, previousRevision?: string) => Promise<Item | undefined>;
  }
> = {
  jira: { connection: 'atlassian', fetch: jiraIssue },
  confluence: { connection: 'atlassian', fetch: confluencePage },
  notion: { connection: 'notion', fetch: notionPage },
  clickup: { connection: 'clickup', fetch: clickupItem },
  linear: { connection: 'linear', fetch: linearItem },
  github: { connection: 'github', fetch: githubIssue },
  web: { fetch: webPage },
};
