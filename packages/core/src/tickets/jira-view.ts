import { z } from 'zod';

// A Jira ticket view as tickets.yaml keeps it (CONTEXT.md, Ticket view): a board's current or
// next sprint, a saved filter, or JQL, narrowed to the person's open tickets unless it says not.

export const JiraViewSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    provider: z.literal('jira'),
    /** The Atlassian site's cloud id. */
    site: z.string().min(1),
    /** Its name, kept to say which site to reconnect to. */
    siteName: z.string().optional(),
    board: z.number().int().positive().optional(),
    /** A board view's board name, kept to show it. */
    boardName: z.string().optional(),
    sprint: z.enum(['current', 'next']).optional(),
    filter: z.string().regex(/^\d+$/).optional(),
    /** A saved filter view's filter name, kept to show it. */
    filterName: z.string().optional(),
    jql: z.string().trim().min(1).max(2000).optional(),
    /** Every assignee's tickets, not only the person's. */
    everyone: z.boolean().optional(),
    /** Done tickets too. */
    showDone: z.boolean().optional(),
  })
  .refine(
    (v) => [v.board, v.filter, v.jql].filter((q) => q !== undefined).length === 1,
    'a view names exactly one of a board, a saved filter, or JQL',
  )
  .refine((v) => v.sprint === undefined || v.board !== undefined, 'only a board view has a sprint');
export type JiraView = z.infer<typeof JiraViewSchema>;

/** What `mesa tickets views add` takes for Jira: the view, its site when the connection reaches several. */
export type JiraViewInput = Omit<
  JiraView,
  'provider' | 'site' | 'siteName' | 'boardName' | 'filterName'
> & { provider?: 'jira'; site?: string };

/** `view` in a line: what it reads and how it narrows it. */
export function describeJiraView(view: JiraView): string {
  const what =
    view.board !== undefined
      ? `${view.sprint === 'next' ? 'Next' : 'Current'} sprint of board ${view.boardName ?? view.board}`
      : view.filter !== undefined
        ? `Saved filter ${view.filterName ?? view.filter}`
        : `JQL: ${view.jql}`;
  const narrowing = [
    view.everyone ? 'everyone' : 'only mine',
    view.showDone ? 'done included' : 'not done',
  ];
  return `${what} (${narrowing.join(', ')})`;
}
