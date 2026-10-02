import { join } from 'node:path';
import type { Http } from '../lib/http.js';
import type { Runner } from '../lib/process.js';
import type { SecretStore } from '../lib/secret-store.js';
import type { MesaDeps } from '../mesa.js';
import type { CallbackListen } from '../sources/callback-listener.js';
import { NOTION_VERSION } from '../sources/notion.js';
import {
  agentWorld,
  claudeResult,
  type FakeWindow,
  finishesRun,
  projectProfile,
  scriptedRunner,
} from './index.js';

/** A Keychain in memory: `items` by `<service> <account>`. */
export function memorySecretStore() {
  const items = new Map<string, string>();
  const key = (service: string, account: string) => `${service} ${account}`;
  const store: SecretStore = {
    get: async (service, account) => items.get(key(service, account)),
    set: async (service, account, value) => void items.set(key(service, account), value),
    delete: async (service, account) => items.delete(key(service, account)),
  };
  return { store, items };
}

/** One request fakeHttp saw, its header names lowercase. */
export type FakeRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};
type FakeAnswer = { status?: number; headers?: Record<string, string> } & (
  | { body: unknown }
  | { html: string }
);

/**
 * HTTP answered from `routes` by `<METHOD> <url>`, a JSON body each (or an HTML page), or a
 * function of the request; any other request is a 404. Every request is recorded, and `routes` may
 * change mid-test.
 */
export function fakeHttp(
  routes: Record<string, FakeAnswer | ((request: FakeRequest) => FakeAnswer)> = {},
) {
  const requests: FakeRequest[] = [];
  const http: Http = async (url, init) => {
    const request: FakeRequest = {
      method: init?.method ?? 'GET',
      url,
      headers: Object.fromEntries(new Headers(init?.headers)),
      ...(init?.body === undefined ? {} : { body: String(init.body) }),
    };
    requests.push(request);
    const route = routes[`${request.method} ${url}`];
    const answer = typeof route === 'function' ? route(request) : route;
    const status = answer ? (answer.status ?? 200) : 404;
    const headers = answer?.headers ?? {};
    if (answer && 'html' in answer) {
      return new Response(answer.html, {
        status,
        headers: { 'content-type': 'text/html', ...headers },
      });
    }
    return new Response(JSON.stringify(answer ? answer.body : { error: 'not_found' }), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  };
  return { http, requests, routes };
}

/**
 * A person signing in: `open` is the runner's `/usr/bin/open`, which, given the broker's
 * authorize URL, comes back to `listen`'s listener (port 49152) as the broker's callback would,
 * with `answer(state)` as its query: a code and the same state unless told otherwise.
 */
export function fakeSignIn(
  answer: (state: string) => Record<string, string> = (state) => ({ code: 'code-1', state }),
) {
  let deliver: ((query: URLSearchParams) => void) | undefined;
  const world = { opened: [] as string[], closed: 0 };
  const listen: CallbackListen = async () => ({
    port: 49152,
    callback: new Promise((resolve) => {
      deliver = resolve;
    }),
    close: () => void world.closed++,
  });
  const open = (args: string[]) => {
    const url = args[0] ?? '';
    world.opened.push(url);
    deliver?.(new URLSearchParams(answer(new URL(url).searchParams.get('state') ?? '')));
    return '';
  };
  return Object.assign(world, { listen, open });
}

/** lantern-cove's Jira and Confluence APIs in atlassianWorld. */
export const TEST_JIRA = 'https://api.atlassian.com/ex/jira/cloud-1/rest/api/3';
export const TEST_CONFLUENCE = 'https://api.atlassian.com/ex/confluence/cloud-1/wiki/api/v2';

/** Where atlassianWorld's broker lives. */
export const TEST_BROKER = 'https://broker.example.test';

/**
 * A source and the broker in memory, with a person who signs in (fakeSignIn): code-1 exchanges
 * for access-1 and refresh-1 (with `expiresIn` seconds, none when undefined), each refresh
 * rotates to the next pair and uses up the old refresh token, and the source's API answers only a
 * live access token, and only a request `accepts`. `revoke` ends every token, as removing the
 * app at the source does; `expire` only the access tokens. `deps` wires it all into testDeps.
 */
function brokerWorld(
  source: string,
  signIn: ReturnType<typeof fakeSignIn>,
  {
    expiresIn,
    accepts = () => true,
  }: { expiresIn?: number; accepts?: (r: FakeRequest) => boolean },
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
        refresh_token: `refresh-${issued}`,
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
