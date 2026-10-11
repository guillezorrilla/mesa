import { MesaError } from '../lib/result.js';
import { issueUrl } from '../sources/atlassian.js';
import type { Site } from '../sources/connection.js';
import { type JiraIssue, readJiraIssue } from '../sources/jira.js';
import {
  assignIssue,
  boards,
  filter,
  filters,
  findBoard,
  jiraFields,
  searchTickets,
  sprints,
  TICKETS,
} from '../sources/jira-tickets.js';
import { jiraAccess } from './jira-access.js';
import { type JiraView, type JiraViewInput, JiraViewSchema } from './jira-view.js';
import { baseJql, viewJql } from './jql.js';
import { categoryOf, type ProviderDeps, parseWith, type TicketProvider } from './provider.js';

/** A Jira issue key: a project key, a dash, a number. */
const KEY = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

const parseJiraView = (input: unknown) => parseWith(JiraViewSchema, input);

/**
 * Jira's row of the ticket providers: views over boards' sprints, saved filters and JQL on the
 * Atlassian connection's sites, and the boards, filters and fields a view or panel can name.
 */
export function jiraProvider(deps: ProviderDeps) {
  const jira = jiraAccess(deps);
  const { get } = jira;

  /** The JQL `view` reads now: a board view's current or next sprint is found again each time. */
  const resolve = async (view: JiraView, site: Site) => {
    if (view.board === undefined) return { jql: viewJql(view, baseJql(view)) };
    const next = view.sprint === 'next';
    const found = await sprints(get(), site, view.board, next ? 'future' : 'active');
    const picked = next ? found.slice(0, 1) : found;
    if (!picked.length) {
      const which = next ? 'next' : 'active';
      return { note: `No ${which} sprint on board ${view.boardName ?? view.board}` };
    }
    const ids = picked.map((s) => s.id);
    return { jql: viewJql(view, baseJql(view, ids)), sprints: picked.map((s) => s.name) };
  };

  /** The connected site `view` is on, or an error that asks to reconnect to it. */
  const siteOfView = async (view: JiraView) => {
    const site = (await jira.connected()).find((s) => s.id === view.site);
    if (!site)
      throw new MesaError(
        'invalid_config',
        `Atlassian is signed in to another site: reconnect to ${view.siteName ?? view.site} to read this view`,
        { connect: 'atlassian' },
      );
    return site;
  };

  const row: TicketProvider<JiraViewInput, JiraView, JiraIssue & { site: string }> = {
    /**
     * `input` on its site. Checking it reads the board's sprints (a kanban board has none) and
     * keeps the board's and the saved filter's names to show them.
     */
    view: async (input, check) => {
      const { site: siteName, provider: _, ...rest } = input;
      const site = await jira.siteOf(siteName);
      const sprint = rest.board !== undefined ? { sprint: rest.sprint ?? 'current' } : {};
      const view = parseJiraView({
        ...rest,
        ...sprint,
        provider: 'jira',
        site: site.id,
        siteName: site.name,
      });
      if (!check) return view;
      if (view.board !== undefined) {
        await sprints(get(), site, view.board, 'active');
        const found = await findBoard(get(), site, view.board);
        if (found) view.boardName = found.name;
      }
      if (view.filter !== undefined)
        view.filterName = (await filter(get(), site, view.filter)).name;
      return view;
    },
    read: async (view) => {
      const site = await siteOfView(view);
      const resolved = await resolve(view, site);
      const found = resolved.jql ? await searchTickets(get(), site, resolved.jql) : [];
      return {
        tickets: found.map((t) => ({ ...t, category: categoryOf(t.category), site: site.id })),
        ...(resolved.jql ? { query: resolved.jql } : {}),
        ...(resolved.sprints ? { sprints: resolved.sprints } : {}),
        ...(resolved.note ? { note: resolved.note } : {}),
        // ponytail: one page of TICKETS; "that many or more" is enough for a count.
        more: found.length >= TICKETS,
      };
    },
    key: (input) => {
      if (!KEY.test(input.trim())) throw new MesaError('usage', `${input} is not a Jira issue key`);
      return input.trim().toUpperCase();
    },
    show: async (key, siteName) => {
      const site = await jira.siteOf(siteName);
      const url = issueUrl(site, key);
      const [issue, me] = await Promise.all([
        readJiraIssue(get(), site.id, key, url, deps.fields()),
        jira.me(),
      ]);
      return { ...issue, url, site: site.id, mine: issue.assignee?.accountId === me.id };
    },
    me: jira.me,
    place: async (siteName) => (await jira.siteOf(siteName)).name,
    /** Mesa's one write to Jira, which needs the write:jira-work scope. */
    assign: async (key, siteName) => {
      const site = await jira.siteOf(siteName);
      const me = await jira.me();
      await assignIssue(get(), site, key, me.id);
      return { assignee: me.name };
    },
  };

  /** `site` as the reads that list from it name it. */
  const named = (site: Site) => ({ id: site.id, name: site.name });
  return {
    ...row,
    boards: async (search?: string, siteName?: string) => {
      const site = await jira.siteOf(siteName);
      return { site: named(site), boards: await boards(get(), site, search) };
    },
    filters: async (search?: string, siteName?: string) => {
      const site = await jira.siteOf(siteName);
      return { site: named(site), filters: await filters(get(), site, search) };
    },
    /** The site's Jira fields a ticket panel can show, whose name holds `search` if given. */
    fields: async (search?: string, siteName?: string) => {
      const site = await jira.siteOf(siteName);
      return { site: named(site), fields: await jiraFields(get(), site, search) };
    },
  };
}
