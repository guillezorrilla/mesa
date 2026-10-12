import { join } from 'node:path';
import type { Runner } from '../lib/process.js';
import type { MesaDeps } from '../mesa.js';
import { NOTION_VERSION } from '../sources/notion.js';
import { agentWorld, claudeResult, finishesRun } from './agents.js';
import { type FakeRequest, fakeHttp, fakeSignIn } from './http.js';
import { projectProfile } from './profile.js';
import { scriptedRunner } from './runner.js';
import { memorySecretStore } from './secrets.js';
import type { FakeWindow } from './tmux.js';

/** lantern-cove's Jira and Confluence APIs in atlassianWorld. */
export const TEST_JIRA = 'https://api.atlassian.com/ex/jira/cloud-1/rest/api/3';
export const TEST_CONFLUENCE = 'https://api.atlassian.com/ex/confluence/cloud-1/wiki/api/v2';

/** Where atlassianWorld's broker lives. */
export const TEST_BROKER = 'https://broker.example.test';

/**
 * A source and the broker in memory, with a person who signs in (fakeSignIn): code-1 exchanges
 * for access-1 and refresh-1 (with `expiresIn` seconds, none when undefined), each refresh
 * rotates to the next pair and uses up the old refresh token, and the source's API answers only a
 * live access token, and only a request `accepts`; with `refreshes` false, the source gives no
 * refresh token, as ClickUp does. `revoke` ends every token, as removing the
 * app at the source does; `expire` only the access tokens. `deps` wires it all into testDeps.
 */
function brokerWorld(
  source: string,
  signIn: ReturnType<typeof fakeSignIn>,
  {
    expiresIn,
    accepts = () => true,
    refreshes = true,
  }: { expiresIn?: number; accepts?: (r: FakeRequest) => boolean; refreshes?: boolean },
) {
  const live = { access: new Set<string>(), refresh: new Set<string>() };
  let issued = 0;
  const issue = () => {
    issued += 1;
    live.access.add(`access-${issued}`);
    live.refresh.add(`refresh-${issued}`);
    return {
      body: {
        access_token: `access-${issued}`,
        ...(refreshes ? { refresh_token: `refresh-${issued}` } : {}),
        ...(expiresIn === undefined ? {} : { expires_in: expiresIn }),
      },
    };
  };
  const refused = { status: 403, body: { error: 'invalid_grant' } };
  const authed = (request: FakeRequest, body: unknown) => {
    if (!live.access.has(request.headers.authorization?.replace(/^Bearer /, '') ?? ''))
      return { status: 401, body: { code: 401, message: 'Unauthorized' } };
    return accepts(request) ? { body } : { status: 400, body: { code: 'bad_request' } };
  };
  const web = fakeHttp({
    [`POST ${TEST_BROKER}/token/${source}`]: (request) => {
      const grant = JSON.parse(request.body ?? '{}');
      if (grant.grant_type === 'authorization_code')
        return grant.code === 'code-1' ? issue() : refused;
      return live.refresh.delete(grant.refresh_token) ? issue() : refused;
    },
  });
  const secrets = memorySecretStore();
  const runner = scriptedRunner({ '/usr/bin/open': signIn.open });
  const deps = {
    http: web.http,
    listen: signIn.listen,
    secretStore: secrets.store,
    run: runner.run,
    env: { MESA_BROKER_URL: TEST_BROKER },
  } satisfies Partial<MesaDeps>;
  return {
    ...web,
    signIn,
    secrets,
    calls: runner.calls,
    deps,
    /** `body` at GET `url`, to a live access token only. */
    serve: (url: string, body: unknown) => {
      web.routes[`GET ${url}`] = (request) => authed(request, body);
    },
    /** What `answer` says to a POST of JSON to `url`, to a live access token only. */
    servePost: (url: string, answer: (body: Record<string, unknown>) => unknown) => {
      web.routes[`POST ${url}`] = (request) =>
        authed(request, answer(JSON.parse(request.body ?? '{}')));
    },
    /** What `answer` says to a PUT of JSON to `url`, to a live access token only. */
    servePut: (url: string, answer: (body: Record<string, unknown>) => unknown) => {
      web.routes[`PUT ${url}`] = (request) =>
        authed(request, answer(JSON.parse(request.body ?? '{}')));
    },
    revoke: () => {
      live.access.clear();
      live.refresh.clear();
    },
    expire: () => live.access.clear(),
  };
}

/**
 * Atlassian and the broker in memory (brokerWorld, hour-long access tokens), an invented account
 * and one site.
 */
export function atlassianWorld(signIn = fakeSignIn()) {
  const world = brokerWorld('atlassian', signIn, { expiresIn: 3600 });
  const { serve } = world;
  serve('https://api.atlassian.com/me', {
    account_id: 'acc-1',
    name: 'Rowan Tide',
    email: 'rowan@example.test',
  });
  serve('https://api.atlassian.com/oauth/token/accessible-resources', [
    { id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' },
  ]);
  return {
    ...world,
    /**
     * Jira issue `key` on lantern-cove, as Jira's REST API answers it: its summary, its status, its
     * rendered description, and its comments, two to a page. Called again, it changes the issue.
     */
    serveIssue: (
      key: string,
      issue: {
        summary: string;
        description: string;
        updated?: string;
        comments?: { by: string; html: string }[];
      },
    ) => {
      const base = `${TEST_JIRA}/issue/${key}`;
      serve(`${base}?expand=renderedFields`, {
        key,
        fields: {
          summary: issue.summary,
          status: { name: 'In Progress' },
          labels: ['tides'],
          updated: issue.updated ?? '2026-09-24T12:00:00Z',
        },
        renderedFields: { description: issue.description },
      });
      serve(`${base}?fields=updated`, {
        fields: { updated: issue.updated ?? '2026-09-24T12:00:00Z' },
      });
      const comments = (issue.comments ?? []).map((c, at) => ({
        author: { displayName: c.by },
        created: `2026-09-2${at}T10:00:00.000+0000`,
        renderedBody: c.html,
      }));
      for (let at = 0; at === 0 || at < comments.length; at += 2) {
        serve(`${base}/comment?expand=renderedBody&startAt=${at}&maxResults=100`, {
          startAt: at,
          maxResults: 2,
          total: comments.length,
          comments: comments.slice(at, at + 2),
        });
      }
    },
    /**
     * A Confluence list at `url` (v2, or CQL search) as `pages` of results, 25 to a page: each
     * page's `_links.next` names the next by cursor `c<n>`, as Confluence's relative URLs do.
     */
    servePaged: (url: string, pages: unknown[][]) => {
      const at = (n: number) =>
        `${url}${url.includes('?') ? '&' : '?'}limit=25${n ? `&cursor=c${n}` : ''}`;
      pages.forEach((results, n) => {
        const next = new URL(at(n + 1));
        const links = n + 1 < pages.length ? { next: `${next.pathname}${next.search}` } : {};
        serve(at(n), { results, _links: links });
      });
    },
    /** Confluence page `id` on lantern-cove, its body as Confluence renders it (`view`). */
    servePage: (
      id: string,
      page: { title: string; html?: string; parentId?: string; version?: number },
    ) => {
      const body = {
        id,
        title: page.title,
        version: { number: page.version ?? 1 },
        ...(page.parentId ? { parentId: page.parentId, parentType: 'page' } : {}),
        body: { view: { value: page.html ?? '' } },
      };
      serve(`${TEST_CONFLUENCE}/pages/${id}?body-format=view`, body);
      serve(`${TEST_CONFLUENCE}/pages/${id}`, body);
    },
  };
}

/** Notion's API in notionWorld. */
export const TEST_NOTION = 'https://api.notion.com/v1';

/** Rich text of `text`, as Notion answers it. */
const rich = (text: string) => [{ type: 'text', text: { content: text }, plain_text: text }];

/**
 * A Notion page as its API answers it: in the workspace, or with `row` a row of data source
 * ds-1 in database `row.database` (its other properties `row.properties`).
 */
export const notionPageObject = (
  id: string,
  title: string,
  row?: { database: string; properties?: Record<string, unknown> },
) => ({
  object: 'page',
  id,
  in_trash: false,
  last_edited_time: '2026-09-24T12:00:00Z',
  parent: row
    ? { type: 'data_source_id', data_source_id: 'ds-1', database_id: row.database }
    : { type: 'workspace', workspace: true },
  properties: { ...row?.properties, Name: { id: 'title', type: 'title', title: rich(title) } },
});

/** A data source (a database's table) as Notion's search answers it. */
export const notionDataSourceObject = (
  id: string,
  database: string,
  title: string,
  under: 'workspace' | 'page' = 'workspace',
) => ({
  object: 'data_source',
  id,
  title: rich(title),
  parent: { type: 'database_id', database_id: database },
  database_parent:
    under === 'workspace'
      ? { type: 'workspace', workspace: true }
      : { type: 'page_id', page_id: 'p' },
});

/**
 * Notion and the broker in memory (brokerWorld): access tokens with no expiry, as Notion's are,
 * and an API that answers only the pinned Notion-Version. Its bot is in the invented workspace
 * Lantern Cove (ws-1), added by Rowan Tide.
 */
export function notionWorld(signIn = fakeSignIn()) {
  const world = brokerWorld('notion', signIn, {
    accepts: (request) => request.headers['notion-version'] === NOTION_VERSION,
  });
  world.serve(`${TEST_NOTION}/users/me`, {
    object: 'user',
    id: 'bot-1',
    type: 'bot',
    name: 'Mesa',
    bot: {
      owner: {
        type: 'user',
        user: {
          object: 'user',
          id: 'user-1',
          name: 'Rowan Tide',
          avatar_url: null,
          type: 'person',
          person: {},
        },
      },
      workspace_id: 'ws-1',
      workspace_name: 'Lantern Cove',
      workspace_limits: { max_file_upload_size_in_bytes: 5_242_880 },
    },
  });
  return {
    ...world,
    /** Page `id` (32 hex): its object (notionPageObject) and its content as Notion's Markdown. */
    servePage: (id: string, page: ReturnType<typeof notionPageObject>, markdown = '') => {
      world.serve(`${TEST_NOTION}/pages/${id}`, page);
      world.serve(`${TEST_NOTION}/pages/${id}/markdown`, {
        object: 'page_markdown',
        id,
        markdown,
        truncated: false,
        unknown_block_ids: [],
      });
    },
    /** Page `id`'s blocks as `pages` of results, 25 to a page, each next one at cursor c<n>. */
    serveBlocks: (id: string, pages: unknown[][]) =>
      pages.forEach((results, n) => {
        const cursor = n ? `&start_cursor=c${n}` : '';
        world.serve(`${TEST_NOTION}/blocks/${id}/children?page_size=25${cursor}`, {
          object: 'list',
          results,
          next_cursor: n + 1 < pages.length ? `c${n + 1}` : null,
          has_more: n + 1 < pages.length,
        });
      }),
    /**
     * A POST list at `path` (search, a query) as `pages` of results, by the body's start_cursor
     * (c<n>); `bodies` records each request's body.
     */
    servePostPaged: (path: string, pages: unknown[][], bodies: unknown[] = []) =>
      world.servePost(`${TEST_NOTION}${path}`, (body) => {
        bodies.push(body);
        const n = Number(String(body.start_cursor ?? 'c0').slice(1));
        return {
          object: 'list',
          results: pages[n] ?? [],
          next_cursor: n + 1 < pages.length ? `c${n + 1}` : null,
          has_more: n + 1 < pages.length,
        };
      }),
  };
}

/** ClickUp's API in clickupWorld. */
export const TEST_CLICKUP = 'https://api.clickup.com/api';

/** The invented ClickUp people clickupWorld knows, by name. */
const CLICKUP_PEOPLE: Record<string, number> = {
  'Rowan Tide': 101,
  'Mira Keel': 102,
  'Ash Pier': 103,
};

/** ClickUp's status types, each with its invented status name and color. */
const CLICKUP_STATUSES = {
  open: { status: 'to do', color: '#87909e' },
  custom: { status: 'in progress', color: '#5f55ee' },
  done: { status: 'review', color: '#f8ae00' },
  closed: { status: 'complete', color: '#008844' },
};

/** A task as ClickUp's API answers it, in Workspace ws-1's Space s1, List l1 in Folder f1. */
export const clickupTaskObject = (
  id: string,
  name: string,
  more: {
    custom?: string;
    type?: keyof typeof CLICKUP_STATUSES;
    assignees?: string[];
    priority?: 'urgent' | 'high' | 'normal' | 'low';
    tags?: string[];
    due?: string;
    parent?: string;
    markdown?: string;
  } = {},
) => ({
  id,
  custom_id: more.custom ?? null,
  name,
  team_id: 'ws-1',
  parent: more.parent ?? null,
  status: { ...CLICKUP_STATUSES[more.type ?? 'open'], type: more.type ?? 'open' },
  priority: more.priority ? { priority: more.priority, color: '#f8ae00' } : null,
  assignees: (more.assignees ?? []).map((username) => ({
    id: CLICKUP_PEOPLE[username] ?? 199,
    username,
    email: `${username.split(' ')[0]?.toLowerCase()}@example.test`,
  })),
  tags: (more.tags ?? []).map((tag) => ({ name: tag, tag_bg: '#4466ff' })),
  due_date: more.due ?? null,
  markdown_description: more.markdown ?? '',
  url: `https://app.clickup.com/t/${id}`,
  list: { id: 'l1', name: 'Sprint 18' },
  folder: { id: 'f1', name: 'Q4 roadmap', hidden: false },
  space: { id: 's1' },
});

/**
 * ClickUp and the broker in memory (brokerWorld): access tokens with no expiry and no refresh
 * token, as ClickUp's are. Rowan Tide signed in and gave Mesa the invented Workspace Lantern Cove
 * (ws-1).
 */
export function clickupWorld(signIn = fakeSignIn()) {
  const world = brokerWorld('clickup', signIn, { refreshes: false });
  world.serve(`${TEST_CLICKUP}/v2/user`, {
    user: { id: 101, username: 'Rowan Tide', email: 'rowan@example.test' },
  });
  world.serve(`${TEST_CLICKUP}/v2/team`, { teams: [{ id: 'ws-1', name: 'Lantern Cove' }] });
  /**
   * Task `id`'s `comments` (newest last), 25 to a page, newest first, as ClickUp pages them;
   * `custom` is the query that names it by its custom id.
   */
  const serveComments = (id: string, comments: { by: string; text: string }[], custom = '') => {
    const newest = comments
      .map((c, at) => ({
        id: `c${at}`,
        comment_text: c.text,
        user: { username: c.by },
        date: String(1790000000000 + at * 60_000),
      }))
      .reverse();
    for (let at = 0; at === 0 || at <= newest.length; at += 25) {
      const last = newest[at - 1];
      const query = [custom, last ? `start=${last.date}&start_id=${last.id}` : '']
        .filter(Boolean)
        .join('&');
      world.serve(`${TEST_CLICKUP}/v2/task/${id}/comment${query ? `?${query}` : ''}`, {
        comments: newest.slice(at, at + 25),
      });
    }
  };
  return {
    ...world,
    /**
     * Task `id` as ClickUp's API answers it, with its Markdown description, and its `comments`
     * (newest last) 25 to a page, newest first, as ClickUp pages them.
     */
    serveTask: (
      id: string,
      task: {
        name: string;
        markdown?: string;
        updated?: string;
        comments?: { by: string; text: string }[];
      },
    ) => {
      world.serve(`${TEST_CLICKUP}/v2/task/${id}?include_markdown_description=true`, {
        id,
        custom_id: null,
        name: task.name,
        markdown_description: task.markdown ?? '',
        status: { status: 'in progress' },
        list: { name: 'Tide charts' },
        assignees: [{ username: 'Rowan Tide' }],
        tags: [{ name: 'tides' }],
        date_created: '1790000000000',
        date_updated: task.updated ?? '1790000000000',
      });
      serveComments(id, task.comments ?? []);
    },
    /**
     * A task whole (clickupTaskObject) and its comments, by its custom id in ws-1 when it has one,
     * else by its id.
     */
    serveTaskObject: (
      task: ReturnType<typeof clickupTaskObject>,
      comments: { by: string; text: string }[] = [],
    ) => {
      const id = task.custom_id ?? task.id;
      const custom = task.custom_id ? 'custom_task_ids=true&team_id=ws-1' : '';
      const query = ['include_markdown_description=true', custom].filter(Boolean).join('&');
      world.serve(`${TEST_CLICKUP}/v2/task/${id}?${query}`, task);
      serveComments(id, comments, custom);
    },
    /** The `pages` of tasks ClickUp answers at `path` (with its query), 100 to a full page. */
    serveTasks: (path: string, pages: unknown[][]) =>
      pages.forEach((tasks, page) => {
        world.serve(`${TEST_CLICKUP}${path}${path.includes('?') ? '&' : '?'}page=${page}`, {
          tasks,
          last_page: page === pages.length - 1,
        });
      }),
    /**
     * ws-1's Space Harbor ops (s1): Folder Q4 roadmap (f1) with List Sprint 18 (l1), and List
     * Inbox (l2) outside any Folder; and its saved views at Everything and in the Space.
     */
    serveLocations: () => {
      world.serve(`${TEST_CLICKUP}/v2/team/ws-1/space?archived=false`, {
        spaces: [{ id: 's1', name: 'Harbor ops', color: '#7b68ee' }],
      });
      world.serve(`${TEST_CLICKUP}/v2/space/s1/folder?archived=false`, {
        folders: [
          {
            id: 'f1',
            name: 'Q4 roadmap',
            lists: [{ id: 'l1', name: 'Sprint 18', task_count: 14 }],
          },
        ],
      });
      world.serve(`${TEST_CLICKUP}/v2/space/s1/list?archived=false`, {
        lists: [{ id: 'l2', name: 'Inbox', task_count: 0 }],
      });
      world.serve(`${TEST_CLICKUP}/v2/team/ws-1/view`, {
        views: [
          { id: 'v-mine', name: 'My open tasks', type: 'list' },
          { id: 'v-doc', name: 'Runbook', type: 'doc' },
        ],
      });
      world.serve(`${TEST_CLICKUP}/v2/space/s1/view`, {
        views: [{ id: 'v-board', name: 'Dock sprint board', type: 'board' }],
      });
      world.serve(`${TEST_CLICKUP}/v2/list/l1`, {
        name: 'Sprint 18',
        folder: { name: 'Q4 roadmap', hidden: false },
        space: { name: 'Harbor ops' },
      });
      world.serve(`${TEST_CLICKUP}/v2/folder/f1`, {
        name: 'Q4 roadmap',
        space: { name: 'Harbor ops' },
      });
      world.serve(`${TEST_CLICKUP}/v2/space/s1`, { name: 'Harbor ops' });
      world.serve(`${TEST_CLICKUP}/v2/view/v-board`, {
        view: { name: 'Dock sprint board', type: 'board' },
      });
    },
  };
}

/** Linear's GraphQL endpoint in linearWorld. */
export const TEST_LINEAR = 'https://api.linear.app/graphql';

type LinearVariables = Record<string, unknown>;

/** The people of linearWorld, by name: Rowan Tide is the one signed in. */
const LINEAR_PEOPLE: Record<string, string> = { 'Rowan Tide': 'user-1', 'Mira Keel': 'user-2' };

/** What a Linear issue's state, priority and assignee are, where a test cares. */
export type LinearIssueFacts = {
  /** Its workflow state's type; started (In Progress) unless given. */
  state?: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  /** Its assignee's name (LINEAR_PEOPLE), Rowan Tide unless given, null for none. */
  assignee?: string | null;
  /** 0 (none) to 4 (low); 2 (High) unless given. */
  priority?: number;
};

const LINEAR_STATES = {
  triage: 'Triage',
  backlog: 'Backlog',
  unstarted: 'Todo',
  started: 'In Progress',
  completed: 'Done',
  canceled: 'Canceled',
};
const LINEAR_PRIORITIES = ['No priority', 'Urgent', 'High', 'Medium', 'Low'];

/** Issue `identifier` as a Linear issue list answers it, in workspace lantern-cove. */
export const linearIssueObject = (
  identifier: string,
  title: string,
  { state = 'started', assignee = 'Rowan Tide', priority = 2 }: LinearIssueFacts = {},
) => ({
  identifier,
  title,
  url: `https://linear.app/lantern-cove/issue/${identifier}/${title.toLowerCase().replaceAll(/\W+/g, '-')}`,
  priority,
  priorityLabel: LINEAR_PRIORITIES[priority],
  state: { name: LINEAR_STATES[state], type: state, color: '#f2c94c' },
  assignee: assignee === null ? null : { id: LINEAR_PEOPLE[assignee] ?? 'user-9', name: assignee },
});

/**
 * Linear and the broker in memory (brokerWorld): day-long access tokens whose refresh tokens
 * rotate, as Linear's do, and one GraphQL endpoint that answers each query by its operation name
 * (`answer`), recorded in `queries`; an answer of undefined is Linear's "Entity not found". Rowan
 * Tide signed in to the invented workspace Lantern Cove (org-1, URL key lantern-cove).
 */
export function linearWorld(signIn = fakeSignIn()) {
  const world = brokerWorld('linear', signIn, { expiresIn: 86399 });
  const operations: Record<string, (variables: LinearVariables) => unknown> = {};
  const queries: { operation: string; variables: LinearVariables }[] = [];
  world.servePost(TEST_LINEAR, (body) => {
    const operation = /^\s*(?:query|mutation) (\w+)/.exec(String(body.query))?.[1] ?? '';
    const variables = (body.variables ?? {}) as LinearVariables;
    queries.push({ operation, variables });
    const answerOf = operations[operation];
    if (!answerOf) return { errors: [{ message: `Cannot query ${operation}` }] };
    const data = answerOf(variables);
    return data === undefined
      ? {
          data: null,
          errors: [{ message: 'Entity not found: Issue', extensions: { code: 'INVALID_INPUT' } }],
        }
      : { data };
  });
  const answer = (operation: string, data: (variables: LinearVariables) => unknown) => {
    operations[operation] = data;
  };
  answer('Viewer', () => ({
    viewer: { id: 'user-1', name: 'Rowan Tide', email: 'rowan@example.test' },
  }));
  answer('Organization', () => ({
    organization: { id: 'org-1', name: 'Lantern Cove', urlKey: 'lantern-cove' },
  }));
  const issues: Record<string, unknown> = {};
  const comments: Record<string, unknown[]> = {};
  /** `list` from the offset cursor `c<n>` names, `size` at a time, as a Linear connection. */
  const page = (list: unknown[], after: unknown, size: number) => {
    const from = after ? Number(String(after).slice(1)) : 0;
    const more = from + size < list.length;
    return {
      nodes: list.slice(from, from + size),
      pageInfo: { hasNextPage: more, endCursor: more ? `c${from + size}` : null },
    };
  };
  answer('Issue', ({ id, after }) => {
    const issue = issues[String(id)];
    return issue && { issue: { ...issue, comments: page(comments[String(id)] ?? [], after, 50) } };
  });
  // The Tickets tab's panel reads the same issue, with more of its fields.
  answer('TicketIssue', ({ id, after }) => {
    const issue = issues[String(id)];
    return issue && { issue: { ...issue, comments: page(comments[String(id)] ?? [], after, 50) } };
  });
  answer('IssueComments', ({ id, after }) =>
    issues[String(id)]
      ? { issue: { comments: page(comments[String(id)] ?? [], after, 50) } }
      : undefined,
  );
  return {
    ...world,
    queries,
    answer,
    /**
     * Issue `identifier` in team Harbour as Linear's API answers it, with its Markdown
     * description, and its `comments` (oldest first) 50 to a page. Called again, it changes it.
     */
    serveIssue: (
      identifier: string,
      issue: {
        title: string;
        description?: string;
        updated?: string;
        comments?: { by: string; text: string }[];
      } & LinearIssueFacts,
    ) => {
      issues[identifier] = {
        ...linearIssueObject(identifier, issue.title, issue),
        description: issue.description ?? null,
        updatedAt: issue.updated ?? '2026-09-24T12:00:00.000Z',
        createdAt: '2026-09-20T09:00:00.000Z',
        estimate: 3,
        dueDate: null,
        team: { key: 'HAR', name: 'Harbour' },
        project: { name: 'Spring tides' },
        cycle: {
          id: 'cycle-4',
          number: 4,
          name: null,
          startsAt: '2026-09-21T00:00:00.000Z',
          endsAt: '2026-10-04T00:00:00.000Z',
        },
        labels: { nodes: [{ name: 'tides', color: '#4ea7fc' }] },
      };
      comments[identifier] = (issue.comments ?? []).map((c, at) => ({
        body: c.text,
        createdAt: new Date(Date.parse('2026-09-21T10:00:00Z') + at * 60_000).toISOString(),
        user: { name: c.by },
      }));
    },
  };
}

/** GitHub's REST API in githubWorld. */
export const TEST_GITHUB = 'https://api.github.com';

/** An issue as GitHub's REST API answers it, in repo `repo`; `pr` makes it a pull request. */
export const githubIssueObject = (
  repo: string,
  number: number,
  title: string,
  more: {
    state?: 'open' | 'closed';
    body?: string;
    assignees?: string[];
    labels?: string[];
    milestone?: { number: number; title: string };
    pr?: boolean;
  } = {},
) => ({
  number,
  title,
  body: more.body ?? '',
  state: more.state ?? 'open',
  html_url: `https://github.com/${repo}/${more.pr ? 'pull' : 'issues'}/${number}`,
  user: { id: 7002, login: 'mira-keel' },
  assignees: (more.assignees ?? []).map((login) => ({ id: GITHUB_PEOPLE[login] ?? 7999, login })),
  labels: (more.labels ?? []).map((name) => ({ name, color: 'd73a4a' })),
  milestone: more.milestone ?? null,
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-24T12:00:00Z',
  ...(more.pr
    ? { pull_request: { url: `https://api.github.com/repos/${repo}/pulls/${number}` } }
    : {}),
});

/** The invented GitHub people githubWorld knows, by login. */
const GITHUB_PEOPLE: Record<string, number> = { 'rowan-tide': 7001, 'mira-keel': 7002 };

/**
 * GitHub and the broker in memory (brokerWorld): 8-hour access tokens that refresh, as a GitHub
 * App's user tokens do. Rowan Tide (rowan-tide) signed in; Mesa's GitHub App is installed on the
 * invented org harbor-co with the repos `serveRepos` names (none at first).
 */
export function githubWorld(signIn = fakeSignIn()) {
  const world = brokerWorld('github', signIn, { expiresIn: 28800 });
  const { serve } = world;
  serve(`${TEST_GITHUB}/user`, {
    id: 7001,
    login: 'rowan-tide',
    name: 'Rowan Tide',
    email: 'rowan@example.test',
  });
  const page = (path: string, body: unknown) =>
    serve(`${TEST_GITHUB}${path}${path.includes('?') ? '&' : '?'}per_page=100&page=1`, body);
  const serveRepos = (repos: string[]) => {
    page('/user/installations', {
      total_count: repos.length ? 1 : 0,
      installations: repos.length ? [{ id: 41, account: { login: 'harbor-co' } }] : [],
    });
    page('/user/installations/41/repositories', {
      total_count: repos.length,
      repositories: repos.map((full_name) => ({
        full_name,
        private: true,
        html_url: `https://github.com/${full_name}`,
      })),
    });
  };
  serveRepos([]);
  return {
    ...world,
    serveRepos,
    /** Repo `repo` exists, with `labels` and open `milestones`. */
    serveRepo: (
      repo: string,
      labels: { name: string; color: string }[] = [],
      milestones: { number: number; title: string }[] = [],
    ) => {
      serve(`${TEST_GITHUB}/repos/${repo}`, { full_name: repo });
      page(`/repos/${repo}/labels`, labels);
      page(`/repos/${repo}/milestones?state=open`, milestones);
      page(`/repos/${repo}/milestones?state=all`, milestones);
    },
    /** What GitHub lists for `repo`'s issues with `query` (state, assignee, labels, milestone). */
    serveIssues: (repo: string, query: string, issues: unknown[]) =>
      serve(`${TEST_GITHUB}/repos/${repo}/issues?${query}&per_page=100&page=1`, issues),
    /** One issue (githubIssueObject) and its comments, oldest first. */
    serveIssue: (
      repo: string,
      issue: ReturnType<typeof githubIssueObject>,
      comments: { by: string; body: string }[] = [],
    ) => {
      serve(`${TEST_GITHUB}/repos/${repo}/issues/${issue.number}`, issue);
      page(
        `/repos/${repo}/issues/${issue.number}/comments`,
        comments.map((c, at) => ({
          user: { id: GITHUB_PEOPLE[c.by] ?? 7999, login: c.by },
          created_at: `2026-09-2${at}T10:00:00Z`,
          body: c.body,
        })),
      );
    },
  };
}

/**
 * The agent of an import-notes run in fakeTmux (`onOpen`): for each `<snapshot>=<note>` argument
 * of its prompt it returns `write(note, snapshot)` as that note, in Claude's result. A window that
 * is no import-notes run is left running.
 */
export const writesImportNotes =
  (write: (note: string, snapshot: string) => string) => (w: FakeWindow) => {
    const args = /'\/import-notes ([^']*)'/.exec(w.launch)?.[1]?.split(' ');
    if (!args) return;
    const result = args
      .map((arg) => {
        const [snapshot = '', note = ''] = arg.split('=');
        return `<!-- note: ${note} -->\n${write(note, snapshot)}`;
      })
      .join('\n\n');
    finishesRun({ output: JSON.stringify({ ...JSON.parse(claudeResult('success')), result }) })(w);
  };

/**
 * Atlassian over atlassianWorld, and a fake claude whose import-notes run writes each note as
 * `write` says (a heading and its snapshot, by default; `agent` swaps it): `run` sends the
 * browser's `/usr/bin/open` to the sign-in and the rest to the agents.
 */
export function importWorld(
  write: (note: string, snapshot: string) => string = (note, snapshot) =>
    `# ${note}\n\nFrom ${snapshot}.`,
) {
  const world = atlassianWorld();
  let agent = writesImportNotes(write);
  const agents = agentWorld({ onOpen: (w) => agent(w) });
  const run: Runner = (file, ...rest) =>
    file === '/usr/bin/open' ? world.deps.run(file, ...rest) : agents.run(file, ...rest);
  return {
    world,
    agents,
    run,
    agent: (next: typeof agent) => {
      agent = next;
    },
  };
}

/** lantern-cove's profile over importWorld(`write`), with Atlassian connected. */
export async function importProfile(write?: (note: string, snapshot: string) => string) {
  let now = '2026-09-24T12:00:00.000Z';
  const { world, agents, run, agent } = importWorld(write);
  const { home, mesa } = projectProfile(run, {
    ...world.deps,
    run,
    clock: () => new Date(now),
  });
  await mesa.sources.connect('atlassian');
  return {
    world,
    agents,
    home,
    mesa,
    vault: join(home, 'vault'),
    at: (iso: string) => {
      now = iso;
    },
    agent,
  };
}
