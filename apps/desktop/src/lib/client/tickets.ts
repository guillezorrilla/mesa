import type {
  Board,
  Filter,
  FollowedView,
  GithubDetail,
  GithubRepo,
  JiraField,
  JiraIssue,
  ProviderId,
  SourceId,
  Ticket,
  TicketDefaults,
  TicketView,
  ViewInput,
  ViewQuery,
} from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

type ListedView = TicketView & { describe: string; following: string[] };
type Follows = { project: string; following: string[] };
type SiteOf<T> = { site: { id: string; name: string } } & T;

/** One ticket whole, as its panel reads it: each provider's own fields, keyed by `provider`. */
export type TicketDetail = (
  | (JiraIssue & { provider: 'jira'; site: string })
  | (GithubDetail & { provider: 'github' })
) & {
  id: string;
  url: string;
  mine: boolean;
  sessions: { id: string; project: string }[];
};

/** Each field of a view's query, any provider's, as its flag; free text goes after `=`. */
const FLAGS: Record<string, { flag: string; joined?: true }> = {
  provider: { flag: 'provider' },
  board: { flag: 'board' },
  sprint: { flag: 'sprint' },
  filter: { flag: 'filter' },
  jql: { flag: 'jql', joined: true },
  repo: { flag: 'repo' },
  labels: { flag: 'label', joined: true },
  milestone: { flag: 'milestone' },
  everyone: { flag: 'everyone' },
  showDone: { flag: 'show-done' },
};

/** The flags that name a view's query, as `mesa tickets views add` and `preview` take them. */
const viewFlags = (view: ViewQuery) =>
  Object.entries(view).flatMap(([field, value]) => {
    const known = FLAGS[field];
    if (!known || value === undefined || value === false) return [];
    if (value === true) return [`--${known.flag}`];
    const text = Array.isArray(value) ? value.join(',') : String(value);
    return known.joined ? [`--${known.flag}=${text}`] : [`--${known.flag}`, text];
  });

/** `--search q` when there is a query. */
const searchFlag = (search?: string) => (search?.trim() ? ['--search', search.trim()] : []);

/** The Tickets tab's commands (CONTEXT.md, Ticket view). */
export const ticketsCommands = {
  'tickets.list': commandWith<
    { project: string },
    {
      project: string;
      /** The tracker the project tracks work in, null when it has none yet. */
      tracker: ProviderId | null;
      /** Its source, when it is not connected: connecting lists the views. */
      connect?: SourceId;
      prompt: string | null;
      projectPrompt: string | null;
      defaults: TicketDefaults;
      views: FollowedView[];
      tickets: Ticket[];
    }
  >(({ project }) => ['tickets', '--', project]),
  'tickets.views': command<ListedView[]>('tickets', 'views'),
  'tickets.viewsAdd': commandWith<{ view: ViewInput }, TicketView & { describe: string }>(
    ({ view }) => ['tickets', 'views', 'add', ...viewFlags(view), '--', view.name],
  ),
  'tickets.viewsRename': commandWith<
    { name: string; to: string },
    TicketView & { describe: string }
  >(({ name, to }) => ['tickets', 'views', 'rename', '--', name, to]),
  'tickets.preview': commandWith<
    { view: ViewQuery },
    {
      describe: string;
      jql: string | null;
      count: number;
      more: boolean;
      sprints?: string[];
      note?: string;
    }
  >(({ view }) => ['tickets', 'preview', ...viewFlags(view)]),
  /** One ticket whole, by its id (jira:LC-12, github:owner/repo#12). */
  'tickets.show': commandWith<{ id: string }, TicketDetail>(({ id }) => [
    'tickets',
    'show',
    '--',
    id,
  ]),
  'tickets.assign': commandWith<{ id: string }, Recorded<{ key: string; assignee: string }>>(
    ({ id }) => ['tickets', 'assign', '--', id],
  ),
  /** Shows, or with `tracker` sets, where a project tracks work; its other views stay, unlisted. */
  'tickets.tracker': commandWith<
    { project: string; tracker?: ProviderId },
    { project: string; tracker: ProviderId | null }
  >(({ project, tracker }) => ['tickets', 'tracker', '--', project, ...(tracker ? [tracker] : [])]),
  /** The GitHub repos a view can follow, the project's remote first, and where to give access to more. */
  'tickets.repos': commandWith<
    { project: string },
    { repos: (GithubRepo & { origin: boolean })[]; install: string }
  >(({ project }) => ['tickets', 'repos', '--project', project]),
  /** A GitHub repo's labels and open milestones. */
  'tickets.repo': commandWith<
    { repo: string },
    {
      repo: string;
      labels: { name: string; color?: string }[];
      milestones: { number: number; title: string }[];
    }
  >(({ repo }) => ['tickets', 'repo', '--', repo]),
  'tickets.defaults': commandWith<
    { project: string; change: Partial<TicketDefaults> },
    TicketDefaults
  >(({ project, change }) => [
    'tickets',
    'defaults',
    ...(change.notes === undefined ? [] : ['--notes', change.notes ? 'on' : 'off']),
    ...(change.assign === undefined ? [] : ['--assign', change.assign ? 'on' : 'off']),
    ...(change.start ? ['--start', change.start] : []),
    '--',
    project,
  ]),
  'tickets.follow': commandWith<{ project: string; view: string }, Follows>(({ project, view }) => [
    'tickets',
    'follow',
    '--',
    project,
    view,
  ]),
  'tickets.unfollow': commandWith<{ project: string; view: string }, Follows>(
    ({ project, view }) => ['tickets', 'unfollow', '--', project, view],
  ),
  'tickets.prompt': commandWith<
    { name?: string; project?: string },
    { project: string | null; prompt: string | null }
  >(({ name, project }) => [
    'tickets',
    'prompt',
    ...(project ? ['--project', project] : []),
    ...(name ? ['--', name] : ['--clear']),
  ]),
  'tickets.boards': commandWith<{ search?: string }, SiteOf<{ boards: Board[] }>>(({ search }) => [
    'tickets',
    'boards',
    ...searchFlag(search),
  ]),
  'tickets.fields': command<SiteOf<{ fields: JiraField[]; shown: JiraField[] }>>(
    'tickets',
    'fields',
  ),
  'tickets.fieldsSet': commandWith<{ ids: string[] }, JiraField[]>(({ ids }) => [
    'tickets',
    'fields',
    'set',
    ...(ids.length ? ['--', ...ids] : ['--clear']),
  ]),
  'tickets.filters': commandWith<{ search?: string }, SiteOf<{ filters: Filter[] }>>(
    ({ search }) => ['tickets', 'filters', ...searchFlag(search)],
  ),
};
