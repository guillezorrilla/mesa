import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { issueUrl } from '../sources/atlassian.js';
import { readJiraIssue } from '../sources/jira.js';
import { assignIssue } from '../sources/jira-tickets.js';
import type { JiraAccess } from './jira-access.js';
import { liveSessions } from './live.js';

/** A Jira issue key: a project key, a dash, a number. */
const KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const issueKey = (key: string) => {
  if (!KEY.test(key.trim())) throw new MesaError('usage', `${key} is not a Jira issue key`);
  return key.trim().toUpperCase();
};

/** One ticket of the Tickets tab: its whole panel, and assigning it to the person. */
export function ticketActions(ctx: MesaContext, jira: JiraAccess) {
  return {
    /** Ticket `key` with its description and comments, whether it is the person's, its sessions. */
    show: async (input: string, siteName?: string) => {
      const key = issueKey(input);
      const site = await jira.siteOf(siteName);
      const url = issueUrl(site, key);
      const [issue, me] = await Promise.all([
        readJiraIssue(jira.get(), site.id, key, url),
        jira.me(),
      ]);
      return {
        ...issue,
        url,
        site: site.id,
        mine: issue.assignee?.accountId === me.id,
        sessions: liveSessions(ctx).get(key) ?? [],
      };
    },
    /** Assigns ticket `key` to the signed-in person: Mesa's one write to Jira, with a receipt. */
    assign: async (input: string, siteName?: string) => {
      const key = issueKey(input);
      const site = await jira.siteOf(siteName);
      return ctx.record(
        {
          kind: 'connection',
          summary: () => `Assigned ${key} to you in Jira`,
          failure: `Could not assign ${key}`,
          inputs: { key, site: site.name },
          outputs: () => ({ key, site: site.name }),
        },
        async () => {
          const me = await jira.me();
          await assignIssue(jira.get(), site, key, me.id);
          return { key, assignee: me.name };
        },
      );
    },
  };
}
