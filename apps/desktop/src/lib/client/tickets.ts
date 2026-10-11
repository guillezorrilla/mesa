import type {
  Board,
  Filter,
  FollowedView,
  JiraIssue,
  Ticket,
  TicketDefaults,
  TicketView,
  ViewInput,
} from '@mesa/core';
import { command, commandWith, type Recorded } from './spec';

type ListedView = TicketView & { describe: string; following: string[] };
type Follows = { project: string; following: string[] };
type SiteOf<T> = { site: { id: string; name: string } } & T;

/** The flags that name a view's query, as `mesa tickets views add` and `preview` take them. */
const viewFlags = (view: Omit<ViewInput, 'name'>) => [
  ...(view.board !== undefined ? ['--board', String(view.board)] : []),
  ...(view.sprint ? ['--sprint', view.sprint] : []),
  ...(view.filter !== undefined ? ['--filter', view.filter] : []),
  ...(view.jql !== undefined ? [`--jql=${view.jql}`] : []),
  ...(view.everyone ? ['--everyone'] : []),
  ...(view.showDone ? ['--show-done'] : []),
];

/** `--search q` when there is a query. */
const searchFlag = (search?: string) => (search?.trim() ? ['--search', search.trim()] : []);

/** The Tickets tab's commands (CONTEXT.md, Ticket view). */
export const ticketsCommands = {
  'tickets.list': commandWith<
    { project: string },
    {
      project: string;
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
  'tickets.preview': commandWith<
    { view: Omit<ViewInput, 'name'> },
    {
      describe: string;
      jql: string | null;
      count: number;
      more: boolean;
      sprints?: string[];
      note?: string;
    }
  >(({ view }) => ['tickets', 'preview', ...viewFlags(view)]),
  'tickets.show': commandWith<
    { key: string },
    JiraIssue & {
      url: string;
      site: string;
      mine: boolean;
      sessions: { id: string; project: string }[];
    }
  >(({ key }) => ['tickets', 'show', '--', key]),
  'tickets.assign': commandWith<{ key: string }, Recorded<{ key: string; assignee: string }>>(
    ({ key }) => ['tickets', 'assign', '--', key],
  ),
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
  'tickets.filters': commandWith<{ search?: string }, SiteOf<{ filters: Filter[] }>>(
    ({ search }) => ['tickets', 'filters', ...searchFlag(search)],
  ),
};
