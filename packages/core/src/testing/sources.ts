import { join } from 'node:path';
import type { Http } from '../lib/http.js';
import type { Runner } from '../lib/process.js';
import type { SecretStore } from '../lib/secret-store.js';
import type { MesaDeps } from '../mesa.js';
import type { CallbackListen } from '../sources/callback-listener.js';
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
type FakeAnswer = { status?: number; body: unknown } | { status?: number; html: string };

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
    if (answer && 'html' in answer) {
      return new Response(answer.html, { status, headers: { 'content-type': 'text/html' } });
    }
    return new Response(JSON.stringify(answer ? answer.body : { error: 'not_found' }), {
      status,
      headers: { 'content-type': 'application/json' },
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

const JIRA = 'https://api.atlassian.com/ex/jira/cloud-1/rest/api/3';
const CONFLUENCE = 'https://api.atlassian.com/ex/confluence/cloud-1/wiki/api/v2';

/** Where atlassianWorld's broker lives. */
export const TEST_BROKER = 'https://broker.example.test';

/**
 * Atlassian and the broker in memory, with a person who signs in (fakeSignIn): code-1 exchanges
 * for access-1 and refresh-1, each refresh rotates to the next pair and uses up the old refresh
 * token, and the APIs answer only a live access token (an invented account and one site).
 * `revoke` ends every token, as removing the app in Atlassian does; `expire` only the access
 * tokens. `deps` wires it all into testDeps.
 */
export function atlassianWorld(signIn = fakeSignIn()) {
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
        expires_in: 3600,
      },
    };
  };
  const refused = { status: 403, body: { error: 'invalid_grant' } };
  const authed = (request: FakeRequest, body: unknown) =>
    live.access.has(request.headers.authorization?.replace(/^Bearer /, '') ?? '')
      ? { body }
      : { status: 401, body: { code: 401, message: 'Unauthorized' } };
  const web = fakeHttp({
    [`POST ${TEST_BROKER}/token/atlassian`]: (request) => {
      const grant = JSON.parse(request.body ?? '{}');
      if (grant.grant_type === 'authorization_code')
        return grant.code === 'code-1' ? issue() : refused;
      return live.refresh.delete(grant.refresh_token) ? issue() : refused;
    },
    'GET https://api.atlassian.com/me': (request) =>
      authed(request, { account_id: 'acc-1', name: 'Rowan Tide', email: 'rowan@example.test' }),
    'GET https://api.atlassian.com/oauth/token/accessible-resources': (request) =>
      authed(request, [
        { id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' },
      ]),
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
  /** `body` at GET `url`, to a live access token only. */
  const serve = (url: string, body: unknown) => {
    web.routes[`GET ${url}`] = (request) => authed(request, body);
  };
  return {
    ...web,
    signIn,
    secrets,
    calls: runner.calls,
    deps,
    /**
     * Jira issue `key` on lantern-cove, as Jira's REST API answers it: its summary, its status, its
     * rendered description, and its comments, two to a page. Called again, it changes the issue.
     */
    serveIssue: (
      key: string,
      issue: { summary: string; description: string; comments?: { by: string; html: string }[] },
    ) => {
      const base = `${JIRA}/issue/${key}`;
      serve(`${base}?expand=renderedFields`, {
        key,
        fields: { summary: issue.summary, status: { name: 'In Progress' }, labels: ['tides'] },
        renderedFields: { description: issue.description },
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
    /** Confluence page `id` on lantern-cove, its body as Confluence renders it (`view`). */
    servePage: (id: string, page: { title: string; html?: string; parentId?: string }) => {
      const body = {
        id,
        title: page.title,
        ...(page.parentId ? { parentId: page.parentId, parentType: 'page' } : {}),
        body: { view: { value: page.html ?? '' } },
      };
      serve(`${CONFLUENCE}/pages/${id}?body-format=view`, body);
      serve(`${CONFLUENCE}/pages/${id}`, body);
    },
    revoke: () => {
      live.access.clear();
      live.refresh.clear();
    },
    expire: () => live.access.clear(),
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
